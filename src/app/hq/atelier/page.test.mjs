import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const missionId = "77777777-7777-4777-8777-777777777777";
function missionFixture() {
  const identity = { missionId, launchId: "55555555-5555-4555-8555-555555555555", workspaceId: "fixture-workspace", commitSha: "a".repeat(40), payloadHash: "b".repeat(64) };
  return { id: missionId, workspaceId: identity.workspaceId, modeId: "fixture-mode", title: "Mission fixture", objective: "Objectif fixture",
    input: { _openhandsLaunch: { ...identity, state: "execution_finished", process: { containerStopped: true, exitCode: 0, deadlineExceeded: false } } },
    result: { summary: "Compte rendu conservé", _openhandsResult: { version: 1, receivedAt: "2026-10-03T12:00:00Z", contentHash: "d".repeat(64), report: {
      ...identity, contractVersion: 1, independentValidationPassed: false, validation: "not_performed", availability: "outcome_present", executionState: "agent_returned", sdkExecutionStatus: "finished",
      summary: { status: "present", path: "report.txt", text: "Livrable intégral <script>not executable</script>", sha256: "c".repeat(64), source: "selected_checkout_file" },
      files: [{ path: "report.txt", status: "unchanged", diff: "", sha256: "c".repeat(64) }], diffScope: "selected_file_contents_only",
    } } } };
}

// Actual server page + actual result renderer. Only auth/data and unrelated shell
// boundaries use DI. No live session, database, provider or sandbox is claimed.
test("Atelier reads and opens the existing scoped durable result without execution", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "atelier-result-page-"));
  const boundary = path.join(dir, "boundaries.mjs");
  writeFileSync(boundary, `
    export const state = { calls: [], gate: null, load: null, unavailable: false };
    export async function requireOwnerAccess(route) { state.calls.push(['owner', route]); return await state.gate(); }
    export function getActiveWorkspaceContext() { state.calls.push(['workspace']); return {activeWorkspace:{id:'fixture-workspace'},activeMode:{id:'fixture-mode'}}; }
    export function createDevelopmentStore() { state.calls.push(['store']); return state.unavailable ? null : {load:async(...args)=>{state.calls.push(['load',...args]);return await state.load();}}; }
    export function CockpitShell({children}) { return children; }
    export function AtelierLocalMissions({workspaceId}) { state.calls.push(['local-read',workspaceId]);return null; }
    export async function signOutAction() { throw Error('sign-out must not run'); }
  `);
  const originalFetch = globalThis.fetch;
  let network = 0;
  globalThis.fetch = async () => { network++; throw Error("unexpected network"); };
  try {
    const { state } = await import(pathToFileURL(boundary).href);
    const aliases = ["@/server/auth/owner", "@/server/auth/actions", "@/core/workspace-context", "@/server/missions/development-mission", "@/features/cockpit/components/cockpit-shell", "@/features/atelier/components/atelier-local-missions"];
    const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, fsCache: false,
      alias: { ...Object.fromEntries(aliases.map(key => [key, boundary])), "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs"), "@": path.join(process.cwd(), "src") } });
    const { default: AtelierPage } = await jiti.import("./page.tsx");
    const call = (params = { mission: missionId }) => AtelierPage({ searchParams: Promise.resolve(params) });
    const reset = () => { state.calls.length = 0; state.unavailable = false; state.gate = () => ({ status: "authorized", user: { id: "fixture-owner" } }); state.load = missionFixture; };
    const render = async (params) => renderToStaticMarkup(await call(params));

    await t.test("pending and denied owner gates perform zero data reads", async () => {
      reset(); let resolve;
      state.gate = () => new Promise(done => { resolve = done; });
      const pending = call(); await Promise.resolve();
      assert.deepEqual(state.calls, [["owner", "/hq/atelier"]]);
      resolve({ status: "forbidden", user: { email: "outsider@example.invalid" } });
      const page = await pending;
      assert.equal(page.type.name, "OwnerAccessDenied");
      assert.deepEqual(state.calls, [["owner", "/hq/atelier"]]);
    });
    await t.test("anonymous redirect and auth exception propagate before reads", async () => {
      for (const error of [Object.assign(Error("redirect"), { digest: "NEXT_REDIRECT" }), Error("session unavailable")]) {
        reset(); state.gate = () => { throw error; };
        await assert.rejects(call, actual => actual === error);
        assert.deepEqual(state.calls, [["owner", "/hq/atelier"]]);
      }
    });
    await t.test("unchanged summary file with no diff opens its full escaped text and export", async () => {
      reset(); const html = await render();
      assert.match(html, /Livrable intégral &lt;script&gt;not executable&lt;\/script&gt;/);
      assert.match(html, /Compte rendu conservé/); assert.match(html, /Télécharger le rapport sélectionné/);
      assert.match(html, /Validation indépendante non reliée/); assert.match(html, /Aucune différence de contenu/);
      assert.doesNotMatch(html, /<script|<iframe|Ouvrir le résultat dans Atelier|Mission approuvée visible/);
      assert.deepEqual(state.calls, [["owner", "/hq/atelier"], ["workspace"], ["store"], ["load", "fixture-workspace", missionId], ["local-read", "fixture-workspace"]]);
    });
    await t.test("plain mission summary is usable even without a bound executor receipt", async () => {
      reset(); state.load = () => ({ ...missionFixture(), input: {}, result: { summary: "Compte rendu sans preuve d’exécution" } });
      const html = await render(); assert.match(html, /Compte rendu sans preuve d’exécution/);
      assert.match(html, /Télécharger ce compte rendu/); assert.match(html, /Aucun reçu OpenHands lié/);
      assert.doesNotMatch(html, /Livrable intégral|Retour d’OpenHands/);
    });
    await t.test("an empty mission does not claim a result or offer an export", async () => {
      reset(); state.load = () => ({ ...missionFixture(), input: {}, result: null });
      const html = await render(); assert.match(html, /Dossier de résultat/);
      assert.match(html, /Aucun compte rendu enregistré à ouvrir/);
      assert.doesNotMatch(html, /Résultat enregistré|Télécharger|Livrable intégral/);
    });
    await t.test("failed or unavailable storage is not reported as an absent mission", async () => {
      for (const unavailable of [false, true]) {
        reset(); state.unavailable = unavailable; state.load = () => { throw Error("private upstream detail"); };
        const html = await render();
        assert.match(html, /Lecture du résultat indisponible/); assert.match(html, /Réessayer la lecture/);
        assert.match(html, new RegExp(`href="/hq/atelier\\?mission=${missionId}"`));
        assert.doesNotMatch(html, /Mission introuvable|private upstream|Livrable intégral|Télécharger/);
        assert.equal(state.calls.filter(([name]) => name === "load").length, unavailable ? 0 : 1);
      }
    });
    await t.test("missing or foreign id/workspace/mode never exposes the result", async () => {
      for (const change of [null, { id: "foreign" }, { workspaceId: "foreign" }, { modeId: "foreign" }]) {
        reset(); state.load = () => change === null ? null : { ...missionFixture(), ...change };
        const html = await render(); assert.match(html, /Mission introuvable dans le projet et le mode actifs/);
        assert.doesNotMatch(html, /Mission fixture|Compte rendu conservé|Livrable intégral|Télécharger/);
      }
    });
    await t.test("absent or malformed mission ids cannot trigger a durable read", async () => {
      for (const mission of [undefined, "../other", [missionId, missionId]]) {
        reset(); const html = await render({ mission });
        assert.match(html, /Ouvrez le résultat depuis le dossier/);
        assert.equal(state.calls.some(([name]) => name === "store" || name === "load"), false);
      }
    });
    await t.test("a tampered receipt cannot disclose selected file content", async () => {
      reset(); state.load = () => { const m = missionFixture(); m.result._openhandsResult.report.payloadHash = "f".repeat(64); return m; };
      const html = await render(); assert.doesNotMatch(html, /Livrable intégral|Télécharger le rapport sélectionné/);
      assert.match(html, /Compte rendu conservé/);
    });
    assert.equal(network, 0);
  } finally { globalThis.fetch = originalFetch; rmSync(dir, { recursive: true, force: true }); }
});
