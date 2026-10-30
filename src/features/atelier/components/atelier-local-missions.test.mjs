import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, fsCache: false, alias: { "@": join(process.cwd(), "src"), "server-only": join(process.cwd(), "src/__server-only-noop.js") } });
const { AtelierMissionList } = await jiti.import("./atelier-mission-list.tsx");
const { AtelierLocalMissions } = await jiti.import("./atelier-local-missions.tsx");
const id = "aaaaaaaa-1111-2222-3333-444444444444";
const mission = (overrides = {}) => ({
  contract: "atelier-mission/v1", id, workspaceId: "workspace-a", createdBy: "owner",
  title: "Mission de test", need: "Livrable vérifiable", createdAt: "2026-10-28T12:00:00Z", updatedAt: "2026-10-28T12:00:00Z", status: "created",
  runtime: { runtimeId: "codex", consumptionMode: "subscription", authMode: "chatgpt_session", requestedModelId: "requested-model" },
  repo: { path: "/private/repository", branch: "atelier/mission", baseBranch: "main", baseSha: "a".repeat(40), headSha: "b".repeat(40) },
  sessionId: null, lock: null, steps: [], artifacts: [], modelProof: { requested: "requested-model", observed: null, matches: false }, ...overrides,
});
const step = (overrides = {}) => ({ id: "step-1", kind: "test", status: "succeeded", executor: "runner", startedAt: "2026-10-28T12:00:00Z", endedAt: "2026-10-28T12:01:00Z", sessionId: null, resumedFrom: null, requestedModelId: null, observedModelId: null, exitCode: 0, reason: null, commitSha: null, ...overrides });
const render = (missions = [], unavailable = false) => renderToStaticMarkup(createElement(AtelierMissionList, { missions, unavailable }));

test("empty and unavailable are distinct; unavailable never asserts no missions", () => {
  assert.match(render(), /Aucune mission atelier locale dans cet espace/);
  const html = render([], true);
  assert.match(html, /role="alert"/);
  assert.match(html, /Lecture des missions indisponible/);
  assert.doesNotMatch(html, /Aucune mission atelier locale/);
});

test("both supported runtimes are named without inventing an active connection", () => {
  const claude = mission({ id: "bbbbbbbb-1111-2222-3333-444444444444", runtime: { runtimeId: "claude-code" } });
  const html = render([mission(), claude]);
  assert.match(html, /Codex/); assert.match(html, /Claude Code/);
  assert.match(html, /aucune connexion active déduite/);
  assert.match(html, /ne relance aucune étape/);
  assert.doesNotMatch(html, /<button|<form|\/resume|\/steps/);
  const unknown = render([mission({ runtime: { runtimeId: "future-runtime" } })]);
  assert.match(unknown, /Runtime non reconnu/);
  assert.doesNotMatch(unknown, /Codex|Claude Code/);
});

test("stored running state is not presented as live execution, even with a saved lock", () => {
  const html = render([mission({ status: "running", lock: { runnerPid: 123, childPid: 456 }, steps: [step({ status: "running", exitCode: null })] })]);
  assert.match(html, /Dernier état enregistré/);
  assert.match(html, /Livrable vérifiable/);
  assert.match(html, /<time dateTime="2026-10-28T12:00:00Z">.*UTC<\/time>/);
  assert.match(html, /En cours — activité non confirmée/);
  assert.doesNotMatch(html, /animate-|oria-pulse|Agent actif|aria-busy/);
});

test("unobserved models and observed model mismatches are not conflated", () => {
  const unknown = render([mission()]);
  assert.match(unknown, /Non prouvé/); assert.doesNotMatch(unknown, /Écart de modèle/);
  const mismatch = render([mission({ modelProof: { requested: "requested", observed: "observed", matches: false } })]);
  assert.match(mismatch, /Écart de modèle/); assert.match(mismatch, /text-\[var\(--coral\)\]/);
  assert.doesNotMatch(render([mission({ modelProof: { requested: "same", observed: "same", matches: true } })]), /Écart de modèle/);
});

test("a historical passed test does not validate a later agent revision", () => {
  const html = render([mission({ status: "awaiting_review", steps: [step(), step({ id: "step-2", kind: "revision", executor: "codex_cli" })] })]);
  assert.match(html, /Dernière vérification enregistrée par le runner : Réussie/);
  assert.match(html, /ce test ne valide pas l’état actuel/);
  assert.match(html, /ne vaut pas validation indépendante/);
});

test("an agent-reported test is not claimed as a runner test, and failed tests stay failed", () => {
  assert.match(render([mission({ steps: [step({ executor: "codex_cli" })] })]), /aucun test enregistré/);
  assert.match(render([mission({ steps: [step({ status: "failed", exitCode: 1 })] })]), /Dernière vérification enregistrée par le runner : Échec/);
  assert.doesNotMatch(render([mission({ steps: [step(), step({ kind: "preview" })] })]), /ce test ne valide pas/);
});

test("review-gated test steps are explicitly not executed, with actionable reasons", () => {
  for (const reason of ["test_harness_changed", "sandbox_unavailable"]) {
    const html = render([mission({ status: "needs_human_review", steps: [step({ status: "needs_human_review", exitCode: null, reason })] })]);
    assert.match(html, /Tests non exécutés — revue humaine requise/);
    assert.match(html, reason === "test_harness_changed" ? /dispositif de test a changé/ : /bac à sable requis est indisponible/);
    assert.doesNotMatch(html, /Dernier test exécuté|<button|<form/);
  }
});

test("quota and interruption guide without claiming automatic or guaranteed resume", () => {
  const quota = render([mission({ status: "blocked", steps: [step({ status: "blocked", reason: "subscription_quota" })] })]);
  assert.match(quota, /Quota d’abonnement atteint/); assert.match(quota, /sans bascule vers une API payante/);
  const interrupted = render([mission({ status: "interrupted", steps: [step({ status: "interrupted", reason: "runner_died", resumedFrom: "saved-session" })] })]);
  assert.match(interrupted, /Reprise explicite à confirmer/); assert.match(interrupted, /ne garantit pas/);
  assert.match(interrupted, /reprise de session enregistrée/);
});

test("artifact links identify file and step, retain workspace scope and display recorded integrity metadata only", () => {
  const artifacts = [1, 2].map(n => ({ id: `artifact-${n}`, kind: "test_log", stepId: `step-${n}`, path: "artifacts/tests.log", bytes: 512, sha256: "c".repeat(64), createdAt: "2026-10-28T12:01:00Z" }));
  const html = render([mission({ workspaceId: "workspace/a b", steps: [step(), step({ id: "step-2" })], artifacts })]);
  assert.match(html, /Journal des tests — tests.log — étape 1/);
  assert.match(html, /Journal des tests — tests.log — étape 2/);
  assert.match(html, /\?workspace=workspace%2Fa%20b/);
  assert.match(html, /512 octets/); assert.match(html, /c{64}/);
  assert.match(html, /pas revérifiées par cette vue/);
  assert.match(html, /min-h-11/); assert.match(html, /focus-visible:outline/);
  assert.doesNotMatch(html, /\/private\/repository/);
});

test("untrusted mission and artifact text stays escaped; orphan artifact is not given a fake step", () => {
  const html = render([mission({ title: "<script>alert(1)</script>", artifacts: [{ id: "a/../x", kind: "transcript", path: "artifacts/<img onerror=alert(1)>.jsonl", stepId: "missing", bytes: 1, sha256: "d".repeat(64) }] })]);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;img/);
  assert.match(html, /étape non retrouvée/); assert.match(html, /a%2F..%2Fx/);
  assert.doesNotMatch(html, /<script|<img|<iframe/);
});

test("all persisted mission states have French labels", () => {
  for (const [status, label] of Object.entries({ created: "Créée", interrupted: "Interrompue", awaiting_review: "À relire", failed: "Échec", blocked: "Bloquée", needs_human_review: "Revue humaine requise" })) {
    assert.ok(render([mission({ status })]).includes(label), status);
  }
});

test("real loader scopes workspace and surfaces unreadable storage instead of a fake empty list", () => {
  const root = mkdtempSync(join(tmpdir(), "atelier-ui-test-"));
  const before = process.env.ORIA_ATELIER_ROOT;
  process.env.ORIA_ATELIER_ROOT = root;
  const renderLoader = () => renderToStaticMarkup(createElement(AtelierLocalMissions, { workspaceId: "workspace-a" }));
  try {
    assert.match(renderLoader(), /Aucune mission atelier locale/);
    mkdirSync(join(root, id));
    writeFileSync(join(root, id, "mission.json"), JSON.stringify(mission()));
    const otherId = "bbbbbbbb-1111-2222-3333-444444444444";
    mkdirSync(join(root, otherId));
    writeFileSync(join(root, otherId, "mission.json"), JSON.stringify(mission({ id: otherId, workspaceId: "workspace-b", title: "Other workspace mission" })));
    assert.match(renderLoader(), /Mission de test/);
    assert.doesNotMatch(renderLoader(), /Other workspace mission/);
    writeFileSync(join(root, id, "mission.json"), "invalid json");
    assert.match(renderLoader(), /Lecture des missions indisponible/);
    assert.doesNotMatch(renderLoader(), /Aucune mission atelier locale/);
  } finally {
    if (before === undefined) delete process.env.ORIA_ATELIER_ROOT; else process.env.ORIA_ATELIER_ROOT = before;
    rmSync(root, { recursive: true, force: true });
  }
});
