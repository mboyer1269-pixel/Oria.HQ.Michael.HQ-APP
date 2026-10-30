import "server-only";
import type { Mission } from "@/core/types";
import type { AtelierOwnerSpecEvidence } from "@/features/missions/atelier-owner-spec-result";
import { readAtelierDevelopmentClaim } from "./atelier-development-contract";
import { OWNER_SPEC_KEY, ownerSpecContextSchema, readOwnerSpecReview, ownerSpecAdmissionSchema,
  ownerSpecAdmissionMatches, validateOwnerSpecResult, type OwnerSpecContext } from "./atelier-owner-spec-contract";

const closed = { executionAvailable: false, independentlyValidated: false } as const;
const owns = (value: unknown, key: string) => value !== null && typeof value === "object"
  && Object.prototype.hasOwnProperty.call(value, key);

/** Strip the raw server evidence from every client-bound mission. Only the
 * validated minimal DTO may carry SPEC text; neither review nor duplicate raw
 * results may leak through the original Mission props when validation fails.
 */
export function ownerSpecMissionForClient(mission: Mission): Mission {
  const input = { ...mission.input };
  delete input[OWNER_SPEC_KEY];
  const result = mission.result ? { ...mission.result } : mission.result;
  if (result) delete result.atelierOwnerSpecV2;
  return { ...mission, input, result };
}

/** Pure read of an already owner-scoped mission. No store, recovery service,
 * host probe or executor: service.recover can publish evidence and is NOT a GET.
 * Hashes establish consistency, not an independent ledger audit or live permission.
 */
export function readOwnerSpecEvidence(mission: Mission, context: OwnerSpecContext): AtelierOwnerSpecEvidence {
  const absent = { ...closed, state: "absent" } as const;
  const invalid = { ...closed, state: "unverified" } as const;
  const hasState = owns(mission.input, OWNER_SPEC_KEY);
  const hasResult = owns(mission.result, "atelierOwnerSpecV2");
  if (!hasState && !hasResult && !owns(mission.input, "_atelierRun")) return absent;
  try {
    const ctx = ownerSpecContextSchema.safeParse(context);
    if (!ctx.success || mission.workspaceId !== ctx.data.workspaceId || mission.modeId !== ctx.data.modeId) return invalid;
    const claim = readAtelierDevelopmentClaim(mission.input._atelierRun);
    if (!claim || claim.binding.missionId !== mission.id || claim.binding.workspaceId !== ctx.data.workspaceId
      || claim.binding.modeId !== ctx.data.modeId || claim.binding.actorId !== ctx.data.actorId) return invalid;
    if (!hasState) return hasResult ? invalid : { ...closed, state: "reserved", runId: claim.runId };
    const raw = mission.input[OWNER_SPEC_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid;
    const state = raw as Record<string, unknown>;
    const reviewed = readOwnerSpecReview(state.review);
    if (!reviewed) return invalid;
    const p = reviewed.payload;
    if (p.missionId !== mission.id || p.workspaceId !== ctx.data.workspaceId || p.modeId !== ctx.data.modeId
      || p.actorId !== ctx.data.actorId || p.runId !== claim.runId
      || JSON.stringify(p.binding) !== JSON.stringify(claim.binding)) return invalid;
    if (!owns(state, "admission")) return hasResult || owns(state, "result") ? invalid
      : { ...closed, state: "reserved", runId: claim.runId };
    const admission = ownerSpecAdmissionSchema.safeParse(state.admission);
    if (!admission.success || !ownerSpecAdmissionMatches(admission.data, p, reviewed.review.payloadHash)) return invalid;
    if (!owns(state, "result") && !hasResult) return { ...closed, state: "awaiting_result", runId: claim.runId };
    const execution = { payload: p, payloadHash: reviewed.review.payloadHash, receipt: admission.data };
    const a = validateOwnerSpecResult(state.result, execution);
    const b = validateOwnerSpecResult(mission.result?.atelierOwnerSpecV2, execution);
    if (!a || !b || JSON.stringify(a) !== JSON.stringify(b)) return invalid;
    return { ...closed, state: "recorded", runId: claim.runId, attemptId: admission.data.attemptId, status: a.status,
      artifact: a.evidence ? { text: a.evidence.specText, sha256: a.evidence.sha256, bytes: a.evidence.bytes,
        baseSha: a.evidence.manifest.baseSha } : null };
  } catch { return invalid; }
}
