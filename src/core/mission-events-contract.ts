import { z } from "zod";

/** Contract for public.mission_events (db/migrations/0037). Spec: docs/architecture/MISSION-EVENTS-SPEC.md */
export const MISSION_STATES = ["queued", "running", "waiting_approval", "approved", "approval_stale", "blocked", "cancelled", "succeeded", "failed", "outcome_unknown"] as const;
export const MISSION_EVENT_TYPES = ["mission_queued", "mission_started", "step_started", "tool_call_completed", "run_cost_recorded", "approval_requested", "approval_granted", "approval_rejected", "approval_consumed", "payload_changed", "mission_blocked", "mission_cancelled", "mission_succeeded", "mission_failed", "outcome_unknown"] as const;
export const MISSION_CHANNELS = ["screen", "mobile", "voice", "agent", "system"] as const;
export const TERMINAL_STATES = new Set<MissionState>(["cancelled", "succeeded", "failed"]);

/** Closed allowlist: capabilities a mission may use without a human grant. Anything else needs approval. */
export const CAPABILITY_ALLOWLIST = ["repo.read", "repo.write_branch", "test.run", "build.run", "llm.subscription"] as const;
/** Approval-requiring capability classes (closed list; mirrors public.mission_capabilities). Class = text before the first ':' or '.'. */
export const CAPABILITY_APPROVAL_CLASSES = ["connector", "secret", "egress", "tool", "harness_change", "unsandboxed", "external_send", "payment", "merge", "delete"] as const;
/** Event types a JWT (authenticated) caller may insert directly; everything else is service_role only. */
export const AUTHENTICATED_INSERTABLE_EVENT_TYPES = ["mission_queued", "mission_cancelled", "approval_rejected"] as const;
/** Existing ad-hoc approvals mapped onto the grant model (migration path in spec). */
export const LEGACY_APPROVAL_CAPABILITIES = { approveHarnessChange: "harness_change", approveUnsandboxed: "unsandboxed" } as const;

export type MissionState = (typeof MISSION_STATES)[number];
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(160);
const capability = z.string().regex(/^[a-z][a-z0-9_.:-]{0,119}$/);
const iso = z.string().datetime({ offset: true });

export const missionEventSchema = z.object({
  workspaceId: id,
  missionId: id,
  seq: z.number().int().min(1),
  intentKey: z.string().min(1).max(200),
  eventType: z.enum(MISSION_EVENT_TYPES),
  state: z.enum(MISSION_STATES),
  traceId: z.string().min(1).max(200),
  payloadHash: hash.nullable(),
  actor: id,
  channel: z.enum(MISSION_CHANNELS),
  capability: capability.nullable(),
  grantId: id.nullable(),
  expiresAt: iso.nullable(),
  costMicroUsd: z.number().int().min(0).nullable(),
  costSource: z.enum(["measured", "estimated"]).nullable(),
  provider: z.string().min(1).max(80).nullable(),
  model: z.string().min(1).max(132).nullable(),
  occurredAt: iso,
}).strict()
  .refine(e => (e.costMicroUsd === null) === (e.costSource === null), { message: "cost_source must be set iff cost_micro_usd is set" })
  .refine(e => !["approval_requested", "approval_granted", "approval_consumed"].includes(e.eventType) || (e.payloadHash !== null && e.capability !== null && e.grantId !== null), { message: "approval events bind payloadHash, capability, grantId" })
  .refine(e => !["approval_requested", "approval_granted"].includes(e.eventType) || e.expiresAt !== null, { message: "approval requests/grants need expiresAt" })
  .refine(e => e.capability === null || isKnownCapability(e.capability), { message: "capability not in the closed list" })
  .refine(e => e.eventType !== "approval_granted" || ["screen", "mobile", "voice"].includes(e.channel), { message: "grants come from a human channel" })
  .refine(e => !(e.channel === "voice" && ["approval_granted", "approval_consumed"].includes(e.eventType) && isVoiceForbidden(e.capability)), { message: "voice may approve only free, reversible allowlisted capabilities" });

export type MissionEvent = z.infer<typeof missionEventSchema>;

export function capabilityClass(cap: string): string { return cap.split(/[:.]/)[0]; }
export function isKnownCapability(cap: string): boolean {
  return (CAPABILITY_ALLOWLIST as readonly string[]).includes(cap) || (CAPABILITY_APPROVAL_CLASSES as readonly string[]).includes(capabilityClass(cap));
}
/** Voice may approve only exact allowlisted (free, reversible) capabilities. */
export function isVoiceForbidden(cap: string | null): boolean {
  return cap !== null && !(CAPABILITY_ALLOWLIST as readonly string[]).includes(cap);
}
export function requiresApproval(cap: string): boolean {
  return !(CAPABILITY_ALLOWLIST as readonly string[]).includes(cap);
}

export type GrantStatus = { grantId: string; capability: string; payloadHash: string; expiresAt: string; stale: boolean; consumed: boolean; expired: boolean; usable: boolean };
export type MissionProjection = {
  missionId: string; state: MissionState; lastSeq: number; currentPayloadHash: string | null;
  grants: GrantStatus[]; costMicroUsd: { measured: number; estimated: number }; errors: string[];
};

/** Pure fold of a mission history. Order is by seq; gaps/duplicates are reported, never repaired. */
export function projectMission(events: readonly MissionEvent[], now: Date): MissionProjection {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const errors: string[] = [];
  sorted.forEach((e, i) => { if (e.seq !== i + 1) errors.push(`seq gap or duplicate at ${e.seq}`); });
  let currentPayloadHash: string | null = null;
  const cost = { measured: 0, estimated: 0 };
  const grants = new Map<string, { e: MissionEvent; staleSeen: boolean; consumed: boolean }>();
  let state: MissionState = "queued";
  for (const e of sorted) {
    if (e.payloadHash !== null) {
      for (const g of grants.values()) if (g.e.payloadHash !== e.payloadHash) g.staleSeen = true;
      currentPayloadHash = e.payloadHash;
    }
    if (e.eventType === "approval_granted" && e.grantId) grants.set(e.grantId, { e, staleSeen: false, consumed: false });
    if (e.eventType === "approval_consumed" && e.grantId) {
      const g = grants.get(e.grantId);
      if (!g) errors.push(`consumed unknown grant ${e.grantId}`);
      else if (g.consumed) errors.push(`grant ${e.grantId} consumed twice`);
      else g.consumed = true;
    }
    if (e.costMicroUsd !== null && e.costSource) cost[e.costSource] += e.costMicroUsd;
    if (!TERMINAL_STATES.has(state)) state = e.state;
  }
  const grantList: GrantStatus[] = [...grants.values()].map(({ e, staleSeen, consumed }) => {
    const expired = new Date(e.expiresAt!).getTime() <= now.getTime();
    return { grantId: e.grantId!, capability: e.capability!, payloadHash: e.payloadHash!, expiresAt: e.expiresAt!, stale: staleSeen, consumed, expired, usable: !staleSeen && !consumed && !expired };
  });
  // A live approval whose payload moved on is reported as approval_stale.
  if (state === "approved" && grantList.some(g => g.stale && !g.consumed)) state = "approval_stale";
  return { missionId: sorted[0]?.missionId ?? "", state, lastSeq: sorted.at(-1)?.seq ?? 0, currentPayloadHash, grants: grantList, costMicroUsd: cost, errors };
}

/** Decide whether a capability use may proceed now, for a given payload. Never consumes anything itself. */
export function authorizeCapability(p: MissionProjection, cap: string, payloadHash: string):
  { ok: true; grantId: string | null } | { ok: false; nextState: "waiting_approval" | "approval_stale"; reason: string } {
  if (!requiresApproval(cap)) return { ok: true, grantId: null };
  const forCap = p.grants.filter(g => g.capability === cap);
  const usable = forCap.find(g => g.usable && g.payloadHash === payloadHash);
  if (usable) return { ok: true, grantId: usable.grantId };
  if (forCap.some(g => g.stale && !g.consumed)) return { ok: false, nextState: "approval_stale", reason: "grant bound to a different payload" };
  if (forCap.some(g => g.consumed)) return { ok: false, nextState: "waiting_approval", reason: "grant already used (single-use)" };
  return { ok: false, nextState: "waiting_approval", reason: "capability not in allowlist; human grant required" };
}
