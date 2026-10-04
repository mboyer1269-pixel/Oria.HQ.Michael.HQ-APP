import type { Mission } from "@/core/types";
import { z } from "zod";

export type TransferState = { kind: "available" | "unavailable" | "reconcile" | "linked" | "error"; message: string; remoteIssueId?: string };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const linkedReceipt = z.object({ version: z.literal(1), state: z.literal("linked"), companyId: z.uuid(), remoteIssueId: z.uuid(),
  correlationKey: z.string().regex(/^hq-mission-[a-f0-9]{64}$/), payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  actorId: z.string().min(1), reservedAt: z.iso.datetime({ offset: true }) }).strict();
const reconcile = (): TransferState => ({ kind: "reconcile", message: "Résultat à réconcilier. Vérifiez la tâche dans Paperclip avant tout nouvel envoi. Aucun renvoi automatique." });
export function missionTransferState(mission: Mission, source: "supabase" | "local" | "mock", enabled: boolean): TransferState {
  if (source !== "supabase") return { kind: "unavailable", message: "Le transfert nécessite une mission enregistrée sur le serveur. Les exemples et brouillons locaux ne sont pas envoyés." };
  if (Object.prototype.hasOwnProperty.call(mission.input, "_paperclipDispatch")) {
    const receipt = mission.input._paperclipDispatch;
    const parsed = linkedReceipt.safeParse(receipt);
    if (parsed.success) return { kind: "linked", message: "Transfert enregistré vers Paperclip. Ce lien ne prouve ni l’exécution ni la réussite de la mission.", remoteIssueId: parsed.data.remoteIssueId };
    return reconcile();
  }
  if (!enabled) return { kind: "unavailable", message: "Le transfert Paperclip n’est pas activé pour cet espace de travail." };
  if (!["draft", "queued", "needs_approval"].includes(mission.status)) return { kind: "unavailable", message: "Cette mission n’est plus dans un état permettant un premier transfert." };
  return { kind: "available", message: "Créer une tâche à préparer dans Paperclip, sans attribution d’agent ni demande d’exécution." };
}

export function parseTransferResponse(status: number, body: unknown): TransferState {
  const receipt = linkedReceipt.safeParse(record(body) ? body.receipt : null);
  if (status >= 200 && status < 300 && record(body) && body.status === "linked" && receipt.success) {
    return { kind: "linked", remoteIssueId: receipt.data.remoteIssueId,
      message: body.auditRecorded === false ? "Lien enregistré. Le journal final n’a pas pu être confirmé ; vérification nécessaire." : "Transfert enregistré. La tâche reste à préparer dans Paperclip ; aucun résultat d’exécution n’est confirmé." };
  }
  if (record(body) && (body.status === "reconciliation_required" || body.reconciliationRequired === true)) return reconcile();
  if (status === 409) return record(body) && body.status === "mission_changed"
    ? { kind: "error", message: "La mission a changé. Actualisez le dossier avant de préparer un nouveau transfert." } : reconcile();
  const messages: Record<number, string> = { 400: "Demande invalide. Actualisez le dossier.", 401: "Reconnectez-vous à HQ avant de poursuivre.", 403: "Le transfert n’est pas autorisé depuis cette session.", 404: "La mission n’est plus disponible dans cet espace.", 422: "Le contenu de la mission dépasse les limites du transfert." };
  if (messages[status]) return { kind: "error", message: messages[status] };
  if (status === 503 && record(body) && ["dispatch_disabled", "disabled", "unconfigured", "workspace_unbound", "durable_store_unavailable"].includes(String(body.status))) return { kind: "error", message: "Le transfert est indisponible sur le serveur. Aucun envoi n’a été engagé par cette demande." };
  return reconcile();
}

export async function transferMission(mission: Pick<Mission, "id" | "updatedAt">, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<TransferState> {
  try {
    const response = await fetcher("/api/orchestration/missions/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", redirect: "error", cache: "no-store", signal,
      body: JSON.stringify({ missionId: mission.id, expectedUpdatedAt: mission.updatedAt, confirm: true }) });
    let body: unknown; try { body = await response.json(); } catch { body = null; }
    return parseTransferResponse(response.status, body);
  } catch { return reconcile(); }
}
