/** Unsent form fields only; request IDs and execution state never belong here. */
export const DEVELOPMENT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const limits = { title: 200, objective: 4000, scope: 1000, acceptanceCriteria: 2000 } as const;
export type DevelopmentDraftValues = Record<keyof typeof limits, string>;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function developmentDraftKey(workspaceId: string) { return `oria:development-unsent:${workspaceId}`; }
function validValues(value: unknown): value is DevelopmentDraftValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return Object.keys(data).sort().join(",") === Object.keys(limits).sort().join(",")
    && Object.entries(limits).every(([key, max]) => typeof data[key] === "string" && data[key].length <= max);
}
export function readDevelopmentDraft(storage: DraftStorage, workspaceId: string, now = Date.now()):
  { status: "ready"; values: DevelopmentDraftValues } | { status: "absent" | "invalid" | "unavailable" } {
  try {
    const key = developmentDraftKey(workspaceId), raw = storage.getItem(key);
    if (raw === null) return { status: "absent" };
    let data: Record<string, unknown> | null = null;
    try { if (raw.length <= 45000) data = JSON.parse(raw); } catch { /* Invalid draft is discarded below. */ }
    if (!data || Object.keys(data).sort().join(",") !== "expiresAt,values,version,workspaceId"
      || data.version !== 1 || data.workspaceId !== workspaceId || !validValues(data.values)
      || typeof data.expiresAt !== "number" || !Number.isFinite(data.expiresAt)
      || data.expiresAt <= now || data.expiresAt > now + DEVELOPMENT_DRAFT_TTL_MS) {
      storage.removeItem(key); return { status: "invalid" };
    }
    return { status: "ready", values: data.values };
  } catch { return { status: "unavailable" }; }
}
export function saveDevelopmentDraft(storage: DraftStorage, workspaceId: string, values: DevelopmentDraftValues, now = Date.now()): boolean {
  if (!validValues(values)) return false;
  try {
    if (Object.values(values).every(value => !value)) storage.removeItem(developmentDraftKey(workspaceId));
    else storage.setItem(developmentDraftKey(workspaceId), JSON.stringify({ version: 1, workspaceId, values, expiresAt: now + DEVELOPMENT_DRAFT_TTL_MS }));
    return true;
  } catch { return false; }
}
export function clearDevelopmentDraft(storage: DraftStorage, workspaceId: string) {
  storage.removeItem(developmentDraftKey(workspaceId));
}
/** A late restore may never overwrite edits, a frozen payload or an active read/write. */
export function canRestoreDevelopmentDraft(state: { edited: boolean; frozen: boolean; busy: boolean }) {
  return !state.edited && !state.frozen && !state.busy;
}
