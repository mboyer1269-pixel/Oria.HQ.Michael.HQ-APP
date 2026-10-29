import { z } from "zod";
import { isSubscriptionOwner } from "@/server/ai/subscription-owner";
import { atelierDevelopmentRequestSchema, type AtelierDevelopmentContext } from "@/server/missions/atelier-development-contract";
import { createAtelierDevelopmentService, type AtelierDevelopmentReceipt } from "@/server/missions/atelier-development-service";

const requestFields = atelierDevelopmentRequestSchema.shape;
export const atelierChatRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("atelier.prepare"), ...requestFields }).strict(),
  z.object({ action: z.literal("atelier.reserve"), ...requestFields,
    expectedBindingHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
export type AtelierChatIdentity = AtelierDevelopmentContext & { role: "owner" | "member" };
type Service = Pick<ReturnType<typeof createAtelierDevelopmentService>, "prepare" | "reserve">;
const noExecution = { executionRequested: false, externalEffectAllowed: false,
  runtimeQualified: false, reservationIsExecutionApproval: false } as const;
const json = (body: Record<string, unknown>, status: number) => Response.json({
  contract: "joris-atelier-reservation/v1", ...body, ...noExecution,
}, { status, headers: { "Cache-Control": "no-store" } });

/** Bounds JSON parsing for every chat request, without requiring new headers on legacy chat. */
export async function readJorisJsonBody(request: Request, limits: { maxBytes?: number; timeoutMs?: number } = {}): Promise<
  { ok: true; body: unknown } | { ok: false; status: 400 | 408 | 413 }
> {
  const maxBytes = limits.maxBytes ?? 40_000;
  const timeoutMs = limits.timeoutMs ?? 5000;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) return { ok: false, status: 400 };
  if (declared !== null && Number(declared) > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failure: 400 | 408 | 413 = 400;
  try {
    const body = await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = []; let bytes = 0;
        while (true) {
          const item = await reader.read(); if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > maxBytes) { failure = 413; throw Error("request_too_large"); }
          chunks.push(item.value);
        }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { failure = 408; reject(Error("request_timeout")); }, timeoutMs); }),
    ]);
    return { ok: true, body };
  } catch { return { ok: false, status: failure }; }
  finally { clearTimeout(timer); void reader.cancel().catch(() => undefined); }
}

function sameOriginJson(request: Request, configuredOrigin: string | undefined) {
  try {
    const requestUrl = new URL(request.url);
    const origin = configuredOrigin ?? requestUrl.origin;
    const publicUrl = new URL(origin);
    if (publicUrl.origin !== origin || !["http:", "https:"].includes(publicUrl.protocol)
      || publicUrl.username || publicUrl.password || request.headers.get("origin") !== origin
      || request.method !== "POST" || request.headers.get("sec-fetch-site") === "cross-site"
      || request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return false;
    // Existing workspace selection stays valid; no arbitrary/duplicate query parameters.
    return requestUrl.searchParams.getAll("workspace").length <= 1
      && [...requestUrl.searchParams.keys()].every(key => key === "workspace");
  } catch { return false; }
}

function responseStatus(receipt: AtelierDevelopmentReceipt) {
  switch (receipt.status) {
    case "prepared": case "reserved": return 200;
    case "invalid_request": return 400;
    case "not_found": case "not_reserved": return 404;
    case "ineligible_mission": case "conflict": return 409;
    case "snapshot_too_large": return 422;
    case "disabled": case "unavailable": case "reconciliation_required": return 503;
  }
}
function summary(receipt: AtelierDevelopmentReceipt) {
  switch (receipt.status) {
    case "prepared": return "Proposition Atelier préparée. Aucun agent lancé; aucune approbation d’exécution accordée.";
    case "reserved": return "Réservation Atelier retrouvable dans la mission. Aucun agent lancé; l’exécution reste une étape distincte.";
    case "snapshot_too_large": return "La mission dépasse la limite de cette réservation. Aucune réservation tentée; aucun agent lancé.";
    case "reconciliation_required": return "Résultat de réservation incertain. Relire la même demande; ne pas créer une nouvelle tentative. Aucun lancement demandé.";
    default: return "Préparation ou réservation Atelier indisponible/refusée. Aucun lancement demandé.";
  }
}

/** Typed owner action, not a conversational command. Never invokes a model, CLI,
 * orphan reaper, path claimer, or execution-approval service. Runtime and repository
 * choices are proposals: their host qualification remains a separate launch gate.
 */
export function createAtelierChatHandler(deps: {
  service?: Service; subscriptionOwner?: (actorId: string) => boolean; publicOrigin?: () => string | undefined;
} = {}) {
  const service = deps.service ?? createAtelierDevelopmentService();
  return async (request: Request, body: unknown, identity: AtelierChatIdentity | null): Promise<Response> => {
    if (!identity) return json({ status: "unauthenticated", code: "AUTH_REQUIRED" }, 401);
    if (identity.role !== "owner" || !(deps.subscriptionOwner ?? isSubscriptionOwner)(identity.actorId))
      return json({ status: "forbidden", code: "SUBSCRIPTION_OWNER_ONLY" }, 403);
    if (!sameOriginJson(request, (deps.publicOrigin ?? (() => process.env.ORIA_HQ_PUBLIC_ORIGIN))()))
      return json({ status: "request_denied", code: "REQUEST_DENIED" }, 403);
    const parsed = atelierChatRequestSchema.safeParse(body);
    if (!parsed.success) return json({ status: "invalid_request", code: "INVALID_REQUEST" }, 400);
    // Identity is exclusively server-derived, never spread from the request body.
    const context = { actorId: identity.actorId, workspaceId: identity.workspaceId, modeId: identity.modeId };
    const input = { missionId: parsed.data.missionId, repository: parsed.data.repository,
      selection: parsed.data.selection, timeoutMs: parsed.data.timeoutMs };
    try {
      const receipt = parsed.data.action === "atelier.prepare" ? await service.prepare(context, input)
        : await service.reserve(context, input, { expectedBindingHash: parsed.data.expectedBindingHash });
      return json({ ...receipt, summary: summary(receipt) }, responseStatus(receipt));
    } catch {
      // The service normally resolves ambiguity itself. Never silently retry an exceptional write.
      const receipt: AtelierDevelopmentReceipt = { ...noExecution,
        status: parsed.data.action === "atelier.reserve" ? "reconciliation_required" : "unavailable" };
      return json({ ...receipt, summary: summary(receipt) }, 503);
    }
  };
}
