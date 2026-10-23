import "server-only";
import { z } from "zod";
import { observedProviderModelIdSchema } from "@/core/openhands-launch-contract";

const reference = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Metadata only: accountRef references account_identities, never a new identity registry.
 * This contract is not a pairing protocol, authentication proof or dispatch permission.
 */
export const personalConnectionSelectionSchema = z.object({
  connectionRef: z.uuid(), ownerActorRef: z.uuid(), workspaceRef: reference,
  hostRef: z.uuid(), accountRef: z.uuid(), providerId: z.literal("claude-code-cli"),
  adapterId: z.literal("claude-code-cli-subscription"),
  modelId: observedProviderModelIdSchema, revision,
}).strict();
export type PersonalConnectionSelection = z.infer<typeof personalConnectionSelectionSchema>;

export const personalConnectionRecordSchema = z.object({
  selection: personalConnectionSelectionSchema,
  state: z.enum(["pending", "paired", "revoked"]),
}).strict();

/** Every observation names the entire selection, including its revision.
 * recordedBy describes authorship only; it never supplies account ownership.
 */
export const personalConnectionObservationSchema = z.object({
  selection: personalConnectionSelectionSchema,
  recordedBy: z.uuid(), observedAtIso: z.iso.datetime({ offset: true }),
  capability: z.enum(["login_recognized", "inference_observed"]),
}).strict();

const scopeSchema = z.object({ ownerActorRef: z.uuid(), workspaceRef: reference }).strict();
const identitySchema = z.object({
  accountRef: z.uuid(), workspaceRef: reference, provider: z.literal("claude"),
}).strict();
const selectionFields = ["connectionRef", "ownerActorRef", "workspaceRef", "hostRef", "accountRef",
  "providerId", "adapterId", "modelId", "revision"] as const;

export type SelectionCheckResult = {
  status: "rejected";
  reason: "invalid_input" | "scope_mismatch" | "not_paired" | "revoked" | "selection_changed"
    | "identity_mismatch" | "evidence_mismatch" | "stale_evidence" | "inference_not_observed";
  externalEffectAllowed: false;
} | {
  status: "consistent";
  /** Deliberately never true: launch authority, transport authentication and
   * an executor-side final recheck remain separate mandatory boundaries. */
  externalEffectAllowed: false;
};

/** Pure validation of server-loaded snapshots, not an authorization endpoint.
 * The caller must authenticate the owner, load the current connection and canonical
 * account_identities reference, authenticate the observation's origin and re-read
 * revocation/revision at execution. Browser-supplied snapshots are not trusted input.
 * No storage, provider call, credential generation or launch occurs here.
 */
export function checkPersonalConnectionSelection(input: {
  scope: unknown; approved: unknown; current: unknown; identity: unknown; observation: unknown;
  nowMs: number; maxEvidenceAgeMs: number;
}): SelectionCheckResult {
  const reject = (reason: Extract<SelectionCheckResult, { status: "rejected" }>["reason"]): SelectionCheckResult =>
    ({ status: "rejected", reason, externalEffectAllowed: false });
  const scope = scopeSchema.safeParse(input?.scope);
  const approved = personalConnectionSelectionSchema.safeParse(input?.approved);
  const current = personalConnectionRecordSchema.safeParse(input?.current);
  const identity = identitySchema.safeParse(input?.identity);
  const observation = personalConnectionObservationSchema.safeParse(input?.observation);
  if (!scope.success || !approved.success || !current.success || !identity.success || !observation.success
    || !Number.isFinite(input.nowMs) || !Number.isFinite(input.maxEvidenceAgeMs)
    || input.maxEvidenceAgeMs < 0 || input.maxEvidenceAgeMs > 3_600_000) return reject("invalid_input");
  const selected = current.data.selection;
  if ([approved.data, selected, observation.data.selection].some(value =>
    value.ownerActorRef !== scope.data.ownerActorRef || value.workspaceRef !== scope.data.workspaceRef)) {
    return reject("scope_mismatch");
  }
  if (current.data.state === "revoked") return reject("revoked");
  if (current.data.state !== "paired") return reject("not_paired");
  if (selectionFields.some(field => selected[field] !== approved.data[field])) return reject("selection_changed");
  if (identity.data.accountRef !== selected.accountRef || identity.data.workspaceRef !== selected.workspaceRef) {
    return reject("identity_mismatch");
  }
  if (selectionFields.some(field => observation.data.selection[field] !== selected[field])) return reject("evidence_mismatch");
  const observedAtMs = Date.parse(observation.data.observedAtIso);
  const age = input.nowMs - observedAtMs;
  if (!Number.isFinite(age) || age < 0 || age > input.maxEvidenceAgeMs) return reject("stale_evidence");
  if (observation.data.capability !== "inference_observed") return reject("inference_not_observed");
  return { status: "consistent", externalEffectAllowed: false };
}
