import { z } from "zod";

const statusLabels = {
  backlog: "À préparer", todo: "À faire", in_progress: "En cours", in_review: "En revue",
  done: "Terminée selon Paperclip", blocked: "Bloquée", cancelled: "Annulée",
} as const;
const snapshotSchema = z.object({
  source: z.literal("paperclip"), workspaceId: z.string().min(1),
  observedAt: z.iso.datetime({ offset: true }),
  page: z.object({ limit: z.literal(50), offset: z.literal(0), mayHaveMore: z.boolean() }),
  issues: z.array(z.object({ id: z.uuid(), title: z.string().min(1).max(2000),
    status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]),
    updatedAt: z.iso.datetime({ offset: true }), assigneeAgentId: z.uuid().nullable(),
  })).max(50),
});
export type OrchestrationState =
  | { kind: "idle" | "loading" }
  | { kind: "unavailable"; message: string }
  | { kind: "ready"; snapshot: z.infer<typeof snapshotSchema> };

export const reportedStatusLabel = (status: keyof typeof statusLabels) => statusLabels[status];

export function parseOrchestrationResponse(status: number, body: unknown, workspaceId: string): OrchestrationState {
  if (status === 401 || status === 403) return { kind: "unavailable", message: "Accès refusé. Vérifiez votre connexion à HQ." };
  const reason = typeof body === "object" && body !== null && "status" in body ? body.status : null;
  if (status === 503) {
    const messages: Record<string, string> = {
      disabled: "Le suivi Paperclip est désactivé sur ce serveur.",
      unconfigured: "La connexion Paperclip reste à configurer sur le serveur.",
      workspace_unbound: "Cet espace de travail n’est pas relié à une organisation Paperclip.",
    };
    if (typeof reason === "string" && messages[reason]) return { kind: "unavailable", message: messages[reason] };
  }
  if (status < 200 || status >= 300) return { kind: "unavailable", message: "Le suivi est momentanément indisponible. Vous pouvez réessayer." };
  const parsed = snapshotSchema.safeParse(body);
  if (!parsed.success || parsed.data.workspaceId !== workspaceId || new Set(parsed.data.issues.map(issue => issue.id)).size !== parsed.data.issues.length) {
    return { kind: "unavailable", message: "La réponse reçue ne permet pas d’afficher un suivi fiable." };
  }
  return { kind: "ready", snapshot: parsed.data };
}

export async function loadOrchestration(workspaceId: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<OrchestrationState> {
  try {
    const response = await fetcher("/api/orchestration/missions", { signal, cache: "no-store", credentials: "same-origin", redirect: "error" });
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    return parseOrchestrationResponse(response.status, body, workspaceId);
  } catch {
    return { kind: "unavailable", message: "Impossible de joindre le suivi. Vérifiez la connexion puis réessayez." };
  }
}
