/** Tab-local preparation only. This contract never creates or approves a mission. */
export const HANDOFF_TTL_MS = 15 * 60 * 1000;
export function developmentHandoffKey(workspaceId: string) {
  return `oria:development-handoff:${workspaceId}`;
}
export function consumeDevelopmentHandoff(storage: Pick<Storage, "getItem" | "removeItem">, workspaceId: string, now = Date.now()): { status: "absent" | "invalid" } | { status: "ready"; objective: string } {
  const key = developmentHandoffKey(workspaceId);
  const raw = storage.getItem(key);
  if (raw === null) return { status: "absent" };
  const objective = decodeDevelopmentHandoff(raw, workspaceId, now);
  storage.removeItem(key);
  return objective === null ? { status: "invalid" } : { status: "ready", objective };
}
export function encodeDevelopmentHandoff(workspaceId: string, objective: string, now = Date.now()) {
  const text = objective.trim();
  if (!text || text.length > 4000) return null;
  return JSON.stringify({ version: 1, workspaceId, objective: text, expiresAt: now + HANDOFF_TTL_MS });
}
export function decodeDevelopmentHandoff(raw: string | null, workspaceId: string, now = Date.now()): string | null {
  if (!raw || raw.length > 25000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const data = value as Record<string, unknown>;
    if (Object.keys(data).sort().join(",") !== "expiresAt,objective,version,workspaceId"
      || data.version !== 1 || data.workspaceId !== workspaceId
      || typeof data.objective !== "string" || !data.objective.trim() || data.objective.length > 4000
      || typeof data.expiresAt !== "number" || !Number.isFinite(data.expiresAt)
      || data.expiresAt <= now || data.expiresAt > now + HANDOFF_TTL_MS) return null;
    return data.objective.trim();
  } catch { return null; }
}
/** Allow durable UUIDs and existing local IDs, never arbitrary URL content. */
export function missionDossierId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(value) ? value : null;
}
export function missionDossierHref(value: unknown): `/hq/missions?mission=${string}#requested-mission` | null {
  const id = missionDossierId(value);
  return id ? `/hq/missions?mission=${id}#requested-mission` : null;
}
