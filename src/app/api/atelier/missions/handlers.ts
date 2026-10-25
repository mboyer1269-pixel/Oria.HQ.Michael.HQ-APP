import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  assertSubscriptionOnly, atelierRoot, createMission, currentLock, interruptMission, listMissions, loadMission, missionDir, missionView,
  readArtifact, readEvents, resolveRepoPath, runCommandStep, startAgentStep, type AtelierMission,
} from "@/server/atelier/atelier-mission";
import { loadSubscriptionCatalog, subscriptionEnabled, type SubscriptionCatalog } from "@/server/ai/subscription-catalog";

/** Server-resolved identity + workspace (from requireWorkspaceApiSession / resolveAuthzContext). */
export type AtelierCtx = { userId: string; workspaceId: string };
export type AtelierDeps = { root?: string; env?: NodeJS.ProcessEnv; catalog?: SubscriptionCatalog | null; pollMs?: number; maxStreamMs?: number };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const notFound = () => json({ error: "Mission atelier introuvable.", code: "not_found" }, 404);
const ERRORS: Record<string, [number, string]> = {
  mission_locked_by_live_runner: [409, "Une étape est déjà en cours."],
  stale_lock_requires_explicit_resume: [409, "Exécution précédente interrompue : utiliser /resume."],
  no_session_to_resume: [409, "Aucune session CLI à reprendre."],
  subscription_auth_required: [503, "Abonnement CLI non connecté (aucun repli API)."],
  repo_outside_atelier_root: [400, "Dépôt hors du dossier atelier de cet espace."],
  invalid_workspace_id: [400, "Identifiant d'espace invalide pour le dossier des dépôts."],
  workspace_path_collision: [409, "Un autre espace utilise déjà ce dossier de dépôts (identifiants identiques sans la casse)."],
  stale_lock_reclaim_in_progress: [409, "Reprise déjà en cours par un autre processus."],
  process_identity_unavailable: [503, "Identité de processus non vérifiable (ni /proc ni ps) : atelier refusé sur cette machine."],
  repo_not_git: [400, "Le dépôt n'est pas un dépôt git."],
};
function fail(error: unknown) {
  const code = error instanceof Error ? error.message : "atelier_failed";
  if (code.startsWith("api_key_present")) return json({ error: "Clé API présente dans l'environnement serveur : exécution refusée.", code: "api_key_present" }, 503);
  const known = ERRORS[code];
  return known ? json({ error: known[1], code }, known[0]) : json({ error: "Échec atelier.", code: "atelier_failed" }, 500);
}
/** Workspace scoping: a mission outside the caller's workspace is reported as absent. */
function scoped(ctx: AtelierCtx, id: string, root: string): AtelierMission | null {
  try { const m = loadMission(id, root); return m.workspaceId === ctx.workspaceId ? m : null; } catch { return null; }
}
const enabled = (deps: AtelierDeps) => subscriptionEnabled(deps.env ?? process.env);
const disabled = () => json({ error: "Runtimes abonnement désactivés (ORIA_HQ_SUBSCRIPTION_RUNTIMES≠1).", code: "runtime_disabled" }, 503);

export function listAtelierMissions(ctx: AtelierCtx, deps: AtelierDeps = {}) {
  return json({ contract: "atelier-mission-list/v1", workspaceId: ctx.workspaceId, missions: listMissions(deps.root ?? atelierRoot(), ctx.workspaceId).map(missionView) });
}
export function getAtelierMission(ctx: AtelierCtx, id: string, deps: AtelierDeps = {}) {
  const m = scoped(ctx, id, deps.root ?? atelierRoot()); return m ? json(missionView(m)) : notFound();
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200), need: z.string().trim().min(1).max(4000), repoPath: z.string().min(1).max(1000),
  runtimeId: z.enum(["codex", "claude-code"]), modelId: z.string().min(1).max(120), specPrompt: z.string().max(8000).optional(),
}).strict();
/** POST /missions: create mission + branch, then start the spec step (202, follow via /events). */
export async function createAtelierMission(ctx: AtelierCtx, body: unknown, deps: AtelierDeps = {}) {
  if (!enabled(deps)) return disabled();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Requête invalide.", code: "invalid_request" }, 400);
  const catalog = deps.catalog === undefined ? await loadSubscriptionCatalog() : deps.catalog;
  if (!catalog?.entries.some(e => e.runtimeId === parsed.data.runtimeId && e.modelId === parsed.data.modelId)) return json({ error: "Modèle absent du catalogue abonnement.", code: "model_unavailable" }, 400);
  const root = deps.root ?? atelierRoot();
  try {
    assertSubscriptionOnly(parsed.data.runtimeId); // refuse before any repo/branch side effect (API key, non-subscription auth)
    const repoPath = resolveRepoPath(parsed.data.repoPath, ctx.workspaceId, deps.env ?? process.env);
    const m = createMission({ ...parsed.data, repoPath, workspaceId: ctx.workspaceId, createdBy: ctx.userId }, root);
    const prompt = parsed.data.specPrompt ?? `Besoin du propriétaire : ${parsed.data.need}\nÉcris UNIQUEMENT un fichier SPEC.md concis (fonctions, règles, erreurs, critères d'acceptation, tests attendus). N'écris pas encore de code. Ne fais pas de commit.`;
    const started = startAgentStep(m.id, "spec", prompt, { root });
    started.done.catch(() => undefined);
    return json({ missionId: m.id, stepId: started.stepId, mission: missionView(started.mission), events: `/api/atelier/missions/${m.id}/events` }, 202);
  } catch (error) { return fail(error); }
}

const stepSchema = z.object({ kind: z.enum(["code", "revision"]), prompt: z.string().trim().min(1).max(8000) }).strict();
/** POST /missions/:id/steps — `code` or `revision` (= correction demandée). */
export function startAtelierStep(ctx: AtelierCtx, id: string, body: unknown, deps: AtelierDeps = {}) {
  if (!enabled(deps)) return disabled();
  const root = deps.root ?? atelierRoot(); if (!scoped(ctx, id, root)) return notFound();
  const parsed = stepSchema.safeParse(body); if (!parsed.success) return json({ error: "Requête invalide.", code: "invalid_request" }, 400);
  try {
    const prompt = parsed.data.kind === "revision" ? `Correction demandée par le propriétaire : ${parsed.data.prompt}\nMets à jour code, SPEC.md et tests, exécute les tests. Ne fais pas de commit.` : parsed.data.prompt;
    const s = startAgentStep(id, parsed.data.kind, prompt, { root }); s.done.catch(() => undefined);
    return json({ missionId: id, stepId: s.stepId, mission: missionView(s.mission) }, 202);
  } catch (error) { return fail(error); }
}
const resumeSchema = z.object({ prompt: z.string().trim().min(1).max(8000).optional() }).strict();
/** POST /missions/:id/resume — explicit resume of the same CLI session (reclaims a dead runner's lock). */
export function resumeAtelierMission(ctx: AtelierCtx, id: string, body: unknown, deps: AtelierDeps = {}) {
  if (!enabled(deps)) return disabled();
  const root = deps.root ?? atelierRoot(); if (!scoped(ctx, id, root)) return notFound();
  const parsed = resumeSchema.safeParse(body ?? {}); if (!parsed.success) return json({ error: "Requête invalide.", code: "invalid_request" }, 400);
  try {
    const s = startAgentStep(id, null, parsed.data.prompt ?? "Reprise après interruption : termine la tâche précédente en repartant de l'état actuel des fichiers. Les tests sont lancés par l'atelier. Ne fais pas de commit.", { root, resume: true });
    s.done.catch(() => undefined);
    return json({ missionId: id, stepId: s.stepId, mission: missionView(s.mission) }, 202);
  } catch (error) { return fail(error); }
}
/** POST /missions/:id/interrupt */
export function interruptAtelierMission(ctx: AtelierCtx, id: string, deps: AtelierDeps = {}) {
  const root = deps.root ?? atelierRoot(); if (!scoped(ctx, id, root)) return notFound();
  const r = interruptMission(id, root);
  return json(r, r.interrupted ? 202 : 409);
}
/** POST /missions/:id/verify — runner executes the fixed `npm test` (no caller-supplied command). */
export function verifyAtelierMission(ctx: AtelierCtx, id: string, deps: AtelierDeps = {}) {
  const root = deps.root ?? atelierRoot(); if (!scoped(ctx, id, root)) return notFound();
  try { return json(missionView(runCommandStep(id, "test", ["npm", "test"], { root }))); } catch (error) { return fail(error); }
}

const TYPES: Record<string, string> = { ".png": "image/png", ".md": "text/markdown; charset=utf-8", ".diff": "text/x-diff; charset=utf-8", ".jsonl": "application/x-ndjson", ".log": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8" };
export function getAtelierArtifact(ctx: AtelierCtx, id: string, artifactId: string, deps: AtelierDeps = {}) {
  const root = deps.root ?? atelierRoot(); if (!scoped(ctx, id, root)) return notFound();
  const found = readArtifact(id, artifactId, root);
  if (!found) return json({ error: "Artefact introuvable.", code: "not_found" }, 404);
  const ext = found.artifact.path.slice(found.artifact.path.lastIndexOf("."));
  return new NextResponse(new Uint8Array(found.content), { headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "x-artifact-sha256": found.artifact.sha256, "x-content-type-options": "nosniff" } });
}

/** Compact projection of one CLI stream line (no raw tool output). */
function agentEvent(line: string): Record<string, unknown> | null {
  try {
    const e = JSON.parse(line);
    if (e.type === "item.completed" && e.item?.type === "agent_message") return { kind: "message", text: String(e.item.text).slice(0, 2000) };
    if (e.type === "item.completed" && e.item?.type === "file_change") return { kind: "file_change", paths: (e.item.changes ?? []).map((c: { path: string }) => c.path) };
    if (e.type === "item.completed" && e.item?.type === "command_execution") return { kind: "command", command: String(e.item.command).slice(0, 300), exitCode: e.item.exit_code ?? null };
    if (e.type === "assistant") { const t = (e.message?.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n"); const tools = (e.message?.content ?? []).filter((c: { type: string }) => c.type === "tool_use").map((c: { name: string }) => c.name); return t ? { kind: "message", text: t.slice(0, 2000) } : tools.length ? { kind: "tool", tools } : null; }
    if (e.type === "turn.completed" || e.type === "result") return { kind: "turn_completed" };
    return null;
  } catch { return null; }
}
/**
 * GET /missions/:id/events — Server-Sent Events. `event: mission` (journal, id = seq; honours
 * Last-Event-ID), `event: agent` (live CLI activity of running steps), `event: snapshot`, `event: end`.
 */
export function streamAtelierEvents(ctx: AtelierCtx, id: string, request: Request, deps: AtelierDeps = {}) {
  const root = deps.root ?? atelierRoot(); if (!scoped(ctx, id, root)) return notFound();
  let after = Number(request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after") ?? 0) || 0;
  const offsets = new Map<string, number>(); const enc = new TextEncoder();
  const started = Date.now(); const poll = deps.pollMs ?? 500; const max = deps.maxStreamMs ?? 15 * 60_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown, eid?: number) => controller.enqueue(enc.encode(`${eid ? `id: ${eid}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("snapshot", missionView(loadMission(id, root)));
      const tick = () => {
        try {
          for (const e of readEvents(id, root, after)) { send("mission", e, e.seq); after = e.seq; }
          const m = loadMission(id, root);
          for (const s of m.steps.filter(x => x.executor !== "runner" && (x.status === "running" || offsets.has(x.id)))) {
            const f = join(missionDir(id, root), "artifacts", `${s.id.slice(0, 8)}-${s.kind}.jsonl`);
            if (!existsSync(f)) continue;
            const text = readFileSync(f, "utf8"); const from = offsets.get(s.id) ?? 0; const end = text.lastIndexOf("\n") + 1;
            if (end > from) { for (const line of text.slice(from, end).split("\n").filter(Boolean)) { const a = agentEvent(line); if (a) send("agent", { stepId: s.id, ...a }); } offsets.set(s.id, end); }
            if (s.status !== "running") offsets.delete(s.id);
          }
          const lock = currentLock(id, root);
          if ((!lock && m.status !== "running") || (lock && !lock.live) || Date.now() - started > max) {
            send("end", { status: m.status, lock: lock ? { live: lock.live, stepId: lock.stepId } : null }); controller.close(); return;
          }
          timer = setTimeout(tick, poll);
        } catch { try { controller.close(); } catch { /* */ } }
      };
      tick();
    },
    cancel() { if (timer) clearTimeout(timer); },
  });
  request.signal?.addEventListener("abort", () => { if (timer) clearTimeout(timer); });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" } });
}
