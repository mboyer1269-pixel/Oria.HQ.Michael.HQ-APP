import { z } from "zod";
import type { AtelierDevelopmentBinding, AtelierDevelopmentClaim, AtelierDevelopmentRequest } from "@/server/missions/atelier-development-contract";

// Browser-safe wire validation only. Server modules (crypto, storage, execution) are never imported at runtime.
const id = z.string().trim().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.iso.datetime({ offset: true });
const catalogId = z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/);
const selectionSchema = z.object({ runtimeId: z.enum(["codex", "claude-code"]), modelId: catalogId, catalogRevision: catalogId }).strict();
export const atelierReservationRequestSchema = z.object({
  missionId: z.uuid(),
  repository: z.object({ relativePath: z.string().min(1).max(600).refine(value => value === value.trim()
    && !value.startsWith("/") && !/[:\\\u0000-\u001f]/.test(value)
    && value.split("/").every(part => part !== "" && part !== "." && part !== "..")),
  baseSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/) }).strict(),
  selection: selectionSchema, timeoutMs: z.number().int().min(1000).max(900_000),
}).strict();
const bindingSchema = z.object({
  version: z.literal(1), workspaceId: id, modeId: id, missionId: z.uuid(), actorId: id,
  missionVersion: date, developmentPayloadHash: hash, missionRiskLevel: z.enum(["low", "medium", "high"]),
  specialist: z.object({ agentId: z.literal("builder"), skillId: z.literal("spec.draft"), purpose: z.literal("instruction_profile_only") }).strict(),
  repository: atelierReservationRequestSchema.shape.repository, selection: selectionSchema,
  limits: z.object({ timeoutMs: atelierReservationRequestSchema.shape.timeoutMs, maxNewAgentSteps: z.literal(1),
    paidApiAllowed: z.literal(false), externalEffectsAllowed: z.literal(false), missionCostBudgetCents: z.number().int().nonnegative().nullable() }).strict(),
  output: z.literal("SPEC.md"), bindingHash: hash,
}).strict();
const claimSchema = z.object({ version: z.literal(1), state: z.literal("reserved"), runId: z.uuid(), reservedAt: date,
  binding: bindingSchema, executionRequested: z.literal(false) }).strict();
const envelope = { contract: z.literal("joris-atelier-reservation/v1"), executionRequested: z.literal(false),
  externalEffectAllowed: z.literal(false), runtimeQualified: z.literal(false), reservationIsExecutionApproval: z.literal(false),
  summary: z.string().max(2000).optional() };
const preparedSchema = z.object({ ...envelope, status: z.literal("prepared"), binding: bindingSchema }).strict();
const reservedSchema = z.object({ ...envelope, status: z.literal("reserved"), claim: claimSchema,
  source: z.enum(["created", "existing", "recovered"]) }).strict();

export type AtelierReservationScope = { workspaceId: string; modeId: string; missionId: string; missionVersion: string; developmentPayloadHash: string };
export type AtelierReservationPending = { version: 1; workspaceId: string; modeId: string; request: AtelierDevelopmentRequest; expectedBindingHash: string };
const pendingSchema = z.object({ version: z.literal(1), workspaceId: id, modeId: id,
  request: atelierReservationRequestSchema, expectedBindingHash: hash }).strict();
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const atelierReservationKey = (scope: AtelierReservationScope) =>
  `hq:atelier-reservation:${encodeURIComponent(scope.workspaceId)}:${encodeURIComponent(scope.modeId)}:${scope.missionId}`;

export function parseAtelierPending(raw: string | null, scope: AtelierReservationScope): AtelierReservationPending | null {
  if (raw === null) return null;
  if (raw.length > 4096) throw Error("invalid_pending");
  const packet = pendingSchema.parse(JSON.parse(raw));
  if (packet.workspaceId !== scope.workspaceId || packet.modeId !== scope.modeId || packet.request.missionId !== scope.missionId) throw Error("foreign_pending");
  return freeze(packet);
}
function sameRequest(binding: AtelierDevelopmentBinding, request: AtelierDevelopmentRequest, scope: AtelierReservationScope) {
  return binding.workspaceId === scope.workspaceId && binding.modeId === scope.modeId && binding.missionId === scope.missionId
    && binding.developmentPayloadHash === scope.developmentPayloadHash
    && request.missionId === scope.missionId && binding.repository.relativePath === request.repository.relativePath
    && binding.repository.baseSha === request.repository.baseSha && binding.selection.runtimeId === request.selection.runtimeId
    && binding.selection.modelId === request.selection.modelId && binding.selection.catalogRevision === request.selection.catalogRevision
    && binding.limits.timeoutMs === request.timeoutMs;
}
function packetFromBinding(binding: AtelierDevelopmentBinding): AtelierReservationPending {
  return freeze({ version: 1 as const, workspaceId: binding.workspaceId, modeId: binding.modeId, expectedBindingHash: binding.bindingHash,
    request: { missionId: binding.missionId, repository: binding.repository, selection: binding.selection, timeoutMs: binding.limits.timeoutMs } });
}

export type AtelierReservationResult =
  | { kind: "prepared"; binding: AtelierDevelopmentBinding }
  | { kind: "reserved"; claim: AtelierDevelopmentClaim; source: "created" | "existing" | "recovered" }
  | { kind: "blocked" | "uncertain"; message: string; beforeWrite?: boolean };
const MESSAGES: Record<string, [number, string]> = {
  unauthenticated: [401, "Session expirée ou absente. Reconnectez-vous avant de poursuivre."],
  forbidden: [403, "Cette réservation est réservée au propriétaire et titulaire de l’abonnement."],
  request_denied: [403, "Requête refusée. Vérifiez votre session et l’adresse de HQ."],
  invalid_request: [400, "Vérifiez le dépôt relatif, le commit complet, le modèle et la durée."],
  not_found: [404, "Cette mission n’est pas disponible dans le projet et le mode actifs."],
  ineligible_mission: [409, "Cette mission n’est pas un brouillon de développement admissible. Actualisez son dossier."],
  conflict: [409, "La mission ou une réservation a changé. Actualisez et faites vérifier le reçu ; ne remplacez pas la réservation."],
  disabled: [503, "La réservation durable est désactivée sur le serveur. Aucun agent lancé."],
  unavailable: [503, "Le service de réservation est indisponible. Aucun lancement demandé."],
};
const uncertain = (): AtelierReservationResult => ({ kind: "uncertain", message: "Résultat de réservation incertain. Vérifiez le même reçu, sans renvoyer la réservation." });

async function boundedJson(response: Response) {
  if (!response.body || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw Error("invalid_response");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 65_536) throw Error("oversized_response"); chunks.push(chunk.value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } finally { void reader.cancel().catch(() => undefined); }
}

/** One typed request, no model message, no redirect, no retry. prepare is the server's non-mutating lookup. */
export async function requestAtelierReservation(action: "prepare" | "reserve", request: AtelierDevelopmentRequest,
  scope: AtelierReservationScope, expectedBindingHash?: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<AtelierReservationResult> {
  const controller = new AbortController();
  const cancel = () => controller.abort(); signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, 15_000);
  const unknown = (): AtelierReservationResult => action === "reserve" ? uncertain()
    : { kind: "blocked", message: "La relecture n’a pas abouti. Aucune nouvelle réservation n’a été envoyée." };
  try {
    const input = atelierReservationRequestSchema.parse(request);
    if (input.missionId !== scope.missionId || (action === "reserve" && !hash.safeParse(expectedBindingHash).success)) return unknown();
    const response = await fetcher(`/api/joris/chat?workspace=${encodeURIComponent(scope.workspaceId)}`, {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: `atelier.${action}`, ...input, ...(action === "reserve" ? { expectedBindingHash } : {}) }),
    });
    // The common authentication gate may return {error,code}, without the Atelier envelope.
    if (response.status === 401) return { kind: "blocked", message: MESSAGES.unauthenticated[1], beforeWrite: true };
    const raw = await boundedJson(response);
    if (action === "prepare" && response.ok) {
      const prepared = preparedSchema.safeParse(raw);
      if (prepared.success && sameRequest(prepared.data.binding, input, scope)
        && prepared.data.binding.missionVersion === scope.missionVersion
        && (!expectedBindingHash || prepared.data.binding.bindingHash === expectedBindingHash))
        return { kind: "prepared", binding: freeze(prepared.data.binding) };
    }
    if (response.ok) {
      const reserved = reservedSchema.safeParse(raw);
      if (reserved.success && sameRequest(reserved.data.claim.binding, input, scope)
        && (!expectedBindingHash || reserved.data.claim.binding.bindingHash === expectedBindingHash))
        return { kind: "reserved", claim: freeze(reserved.data.claim), source: reserved.data.source };
      return unknown();
    }
    const failure = z.object({ ...envelope, status: z.string(), code: z.string().optional() }).passthrough().safeParse(raw);
    if (!failure.success) return unknown();
    if (failure.data.status === "reconciliation_required") return uncertain();
    if (response.status === 422 && failure.data.status === "snapshot_too_large" && failure.data.reservationAttempted === false)
      return { kind: "blocked", beforeWrite: true, message: "Mission trop volumineuse pour cette réservation. Aucune réservation tentée ; faites vérifier le dossier." };
    const known = MESSAGES[failure.data.status];
    // reserve can report conflict after a write attempt and a changed reread.
    // A 409 is not proof that no reservation was committed: retain its recovery hint.
    if (known && known[0] === response.status) return { kind: "blocked", message: known[1],
      beforeWrite: !(action === "reserve" && failure.data.status === "conflict") };
    return unknown();
  } catch { return unknown(); }
  finally { clearTimeout(timer); controller.abort(); signal?.removeEventListener("abort", cancel); }
}

export type AtelierModelProposal = z.infer<typeof selectionSchema> & { executable: boolean };
export const atelierModelProposalKey = (selection: z.infer<typeof selectionSchema>) => JSON.stringify([selection.runtimeId, selection.modelId, selection.catalogRevision]);
export async function loadAtelierModelProposals(workspaceId: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<AtelierModelProposal[]> {
  const controller = new AbortController(); const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true }); if (signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, 15_000);
  try {
  const response = await fetcher(`/api/joris/chat?workspace=${encodeURIComponent(workspaceId)}`, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal });
  if (!response.ok) throw Error(response.status === 401 ? "unauthenticated" : response.status === 403 ? "forbidden" : "unavailable");
  const raw = z.object({ options: z.array(z.unknown()).max(400) }).parse(await boundedJson(response));
  const optionSchema = selectionSchema.extend({ consumptionMode: z.literal("subscription"), executable: z.boolean() }).strip();
  const options: AtelierModelProposal[] = []; const seen = new Set<string>();
  for (const candidate of raw.options) {
    if (!candidate || typeof candidate !== "object" || !("consumptionMode" in candidate) || candidate.consumptionMode !== "subscription") continue;
    const option = optionSchema.parse(candidate); const key = atelierModelProposalKey(option);
    if (seen.has(key)) throw Error("duplicate_model"); seen.add(key);
    options.push({ runtimeId: option.runtimeId, modelId: option.modelId, catalogRevision: option.catalogRevision, executable: option.executable });
  }
  return options;
  } finally { clearTimeout(timer); controller.abort(); signal?.removeEventListener("abort", cancel); }
}

export type AtelierReservationState = { ready: boolean; busy: boolean; storageError: boolean;
  prepared: { request: AtelierDevelopmentRequest; binding: AtelierDevelopmentBinding } | null;
  pending: AtelierReservationPending | null; result: AtelierReservationResult | null };
export const initialAtelierReservationState = (): AtelierReservationState => ({ ready: false, busy: false, storageError: false, prepared: null, pending: null, result: null });
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A bounded client state machine. Stored parameters are recovery hints, never server authority. */
export function createAtelierReservationSession(deps: { scope: AtelierReservationScope; storage: () => StoragePort;
  fetcher?: typeof fetch; changed: (state: AtelierReservationState) => void; existing?: { present: boolean; claim: unknown } }) {
  let state = initialAtelierReservationState(); let active = true; let generation = 0; let inFlight: AbortController | null = null;
  const key = atelierReservationKey(deps.scope);
  const publish = (patch: Partial<AtelierReservationState>) => { state = { ...state, ...patch }; if (active) deps.changed(state); };
  const storageFailure = () => publish({ ready: true, storageError: true, prepared: null,
    result: { kind: "blocked", message: "Suivi de réservation indisponible ou illisible. Confirmation bloquée ; conservez ce dossier et faites vérifier le reçu serveur." } });
  function readPending() { return parseAtelierPending(deps.storage().getItem(key), deps.scope); }
  function acceptPending(packet: AtelierReservationPending) {
    publish({ ready: true, pending: packet, prepared: null, result: { kind: "uncertain", message: "Une réservation reste à vérifier. Relisez le même reçu sans envoyer de nouvelle confirmation." } });
  }
  function removeOwnPending(packet: AtelierReservationPending) {
    const storage = deps.storage(); const current = readPending();
    if (current && JSON.stringify(current) !== JSON.stringify(pendingSchema.parse(packet))) throw Error("pending_changed");
    if (current) storage.removeItem(key);
  }
  async function run(action: "prepare" | "reserve", request: AtelierDevelopmentRequest, expectedHash?: string, reconciling = false) {
    const ticket = ++generation; const controller = new AbortController(); inFlight = controller;
    publish({ busy: true, result: null });
    const result = await requestAtelierReservation(action, request, deps.scope, expectedHash, deps.fetcher, controller.signal);
    if (!active || ticket !== generation) return;
    inFlight = null;
    if (result.kind === "reserved") {
      try { if (state.pending) removeOwnPending(state.pending); }
      catch { publish({ storageError: true }); }
      publish({ busy: false, prepared: null, pending: null, result }); return;
    }
    if (reconciling || (action === "reserve" && !(result.kind === "blocked" && result.beforeWrite))) {
      publish({ busy: false, prepared: null, result: result.kind === "prepared" ? { kind: "uncertain",
        message: "Cette relecture n’a pas retrouvé de réservation confirmée. Elle ne tranche pas l’issue initiale : ne renvoyez pas la réservation, faites réconcilier le dossier." }
        : result.kind === "blocked" ? { kind: "uncertain", message: `${result.message} Le reçu initial reste à réconcilier ; aucun nouvel envoi.` } : result }); return;
    }
    if (action === "reserve" && state.pending) {
      try { removeOwnPending(state.pending); publish({ pending: null }); } catch { storageFailure(); publish({ busy: false }); return; }
    }
    publish({ busy: false, result, prepared: result.kind === "prepared" ? { request, binding: result.binding } : null });
  }
  return {
    getState: () => state,
    activate() { active = true; },
    restore() {
      if (!active || state.ready) return;
      try {
        const pending = readPending(); if (pending) { acceptPending(pending); return; }
        if (deps.existing?.present) {
          const claim = claimSchema.parse(deps.existing.claim); const packet = packetFromBinding(claim.binding);
          if (!sameRequest(claim.binding, packet.request, deps.scope)) throw Error("foreign_claim");
          acceptPending(packet); return; // Read-only hint from the mission. Server prepare must validate it again.
        }
        publish({ ready: true });
      } catch { storageFailure(); }
    },
    async prepare(raw: unknown) {
      if (!active || !state.ready || state.busy || state.storageError || state.pending || state.result?.kind === "reserved") return;
      try { const pending = readPending(); if (pending) { acceptPending(pending); return; } } catch { storageFailure(); return; }
      const request = atelierReservationRequestSchema.safeParse(raw);
      if (!request.success || request.data.missionId !== deps.scope.missionId) { publish({ result: { kind: "blocked", message: MESSAGES.invalid_request[1] } }); return; }
      publish({ prepared: null }); await run("prepare", freeze(request.data));
    },
    async reserve(confirmed: boolean) {
      if (!active || !confirmed || !state.ready || state.busy || state.storageError || state.pending || !state.prepared) return;
      const prepared = state.prepared;
      const packet = packetFromBinding(prepared.binding);
      try {
        const prior = readPending(); if (prior) { acceptPending(prior); return; }
        const encoded = JSON.stringify(packet); const storage = deps.storage();
        storage.setItem(key, encoded); if (storage.getItem(key) !== encoded) throw Error("pending_not_saved");
      } catch { storageFailure(); return; }
      publish({ pending: packet, prepared: null }); await run("reserve", prepared.request, packet.expectedBindingHash);
    },
    async reconcile() {
      if (!active || !state.ready || state.busy || !state.pending) return;
      const packet = state.pending; await run("prepare", packet.request, packet.expectedBindingHash, true);
    },
    edit() { if (active && !state.busy && !state.pending && !state.storageError && state.result?.kind !== "reserved") publish({ prepared: null, result: null }); },
    dispose() { active = false; generation += 1; inFlight?.abort(); },
  };
}
