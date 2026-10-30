import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, fsCache: false });
const { AtelierReservationPanel, AtelierReservationReview, AtelierReservationOutcome } = await jiti.import("./atelier-reservation-panel.tsx");
const mission = { id: "77777777-7777-4777-8777-777777777777", workspaceId: "workspace-a", modeId: "development",
  updatedAt: "2026-10-28T12:00:00Z", title: "Mission <script>unsafe</script>", objective: "Objectif <img onerror=alert(1)>",
  input: { development: { version: 1, payloadHash: "b".repeat(64), scope: "Périmètre <iframe>", acceptanceCriteria: "Critères vérifiables" } } };
const binding = { version: 1, workspaceId: "workspace-a", modeId: "development", missionId: mission.id, actorId: "owner",
  missionVersion: mission.updatedAt, developmentPayloadHash: "b".repeat(64), missionRiskLevel: "low",
  specialist: { agentId: "builder", skillId: "spec.draft", purpose: "instruction_profile_only" },
  repository: { relativePath: "repo/app", baseSha: "a".repeat(40) }, selection: { runtimeId: "codex", modelId: "exact-model", catalogRevision: "catalog-1" },
  limits: { timeoutMs: 60000, maxNewAgentSteps: 1, paidApiAllowed: false, externalEffectsAllowed: false, missionCostBudgetCents: null },
  output: "SPEC.md", bindingHash: "c".repeat(64) };
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

test("local/mock/non-development missions never expose a reservation form", () => {
  for (const source of ["local", "mock"]) {
    const html = render(AtelierReservationPanel, { mission, source }); assert.match(html, /enregistrée durablement est nécessaire/); assert.doesNotMatch(html, /<form|<input|<button/);
  }
  assert.match(render(AtelierReservationPanel, { mission: { ...mission, input: {} }, source: "supabase" }), /enregistrée durablement est nécessaire/);
});
test("durable panel server-renders an initial waiting state without storage/network access or execution claims", () => {
  const html = render(AtelierReservationPanel, { mission, source: "supabase" });
  assert.match(html, /Lecture du suivi de réservation/); assert.match(html, /sans lancement/);
  assert.doesNotMatch(html, /<form|<input|<button|Agent actif/);
});
test("review renders exact parameters and escapes source text without exposing authority or invented proof", () => {
  const html = render(AtelierReservationReview, { mission, binding });
  for (const text of ["repo/app", "exact-model", "catalog-1", "60 secondes", "SPEC.md", "Non renseigné", "Aucun agent assigné ou lancé", "non qualifié", "non vérifié", "ni approbation d’exécution"]) assert.ok(html.includes(text), text);
  assert.match(html, /a{40}/); assert.match(html, /c{64}/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;img/); assert.match(html, /&lt;iframe/); assert.doesNotMatch(html, /<script|<img|<iframe/);
  assert.match(html, /min-h-11/); assert.match(html, /focus-visible:outline/);
});
test("reserved receipt says reserved, not approved, connected, validated or running", () => {
  const html = render(AtelierReservationOutcome, { result: { kind: "reserved", source: "recovered", claim: { runId: "receipt-reference" } } });
  assert.match(html, /Réservation retrouvée/); assert.match(html, /receipt-reference/); assert.match(html, /Aucun agent lancé/); assert.match(html, /n’est pas une approbation/);
  assert.doesNotMatch(html, /<button|Lancer|Reprendre l’exécution|Mission terminée/);
});
test("integration is one dossier mount, no new dashboard or automatic execution entry", () => {
  const dossier = readFileSync(new URL("./mission-dossier.tsx", import.meta.url), "utf8");
  const source = readFileSync(new URL("./atelier-reservation-panel.tsx", import.meta.url), "utf8");
  assert.match(dossier, /<AtelierReservationPanel mission=\{selected\} source=\{source\} \/>/);
  assert.match(source, /min=\{1\} max=\{900\} step=\{1\}/);
  assert.match(source, /Réserver cette préparation — sans lancer/);
  assert.match(source, /Vérifier la réservation — sans renvoyer/);
  assert.doesNotMatch(source, /\/api\/atelier|subscriptionSelection|runSubscriptionTurn|\.approve\(/);
});

test("reservation review keeps decision parameters visible and technical proof in a separate disclosure", () => {
  const html = render(AtelierReservationReview, { mission, binding });
  assert.match(html, /Objectif et critères de la mission/);
  assert.match(html, /Informations techniques de la préparation/);
  const visible = html.replace(/<details\b[\s\S]*?<\/details>/g, "");
  for (const value of ["repo/app", "exact-model", "60 secondes", "SPEC.md", "Non renseigné", "ni approbation d’exécution"]) assert.ok(visible.includes(value), value);
  assert.doesNotMatch(visible, /a{40}|c{64}/); assert.match(html, /a{40}/); assert.match(html, /c{64}/);
});

test("alerts and confirmation are outside parameter disclosure; fields retain their DOM on collapse", () => {
  const source = readFileSync(new URL("./atelier-reservation-panel.tsx", import.meta.url), "utf8");
  const root = source.slice(source.indexOf("const stage ="));
  assert.match(root, /return <section/); assert.doesNotMatch(root, /return <details/);
  const formEnd = root.indexOf("</form></details>}");
  const formStart = root.indexOf("{canEdit &&");
  assert.ok(root.indexOf("{catalogMessage &&") < formStart);
  assert.ok(root.indexOf('catalogState === "loaded" && options.length === 0 && <p') < formStart);
  for (const text of ["{state.prepared &&", "{state.pending &&", 'role="status" aria-live="polite"', "{state.storageError &&"]) assert.ok(root.indexOf(text) > formEnd);
  assert.match(root, /<details className="mt-4"><summary/); assert.doesNotMatch(root, /onToggle|aria-expanded|setInterval/);
  assert.match(source, /border-\[var\(--fg-faint\)\]/);
});

test("interactive boundaries use an existing token with at least 3:1 contrast on both adjacent surfaces", () => {
  const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  const token = name => css.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6})`, "i"))[1];
  const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const foreground = luminance(token("fg-faint"));
  for (const bg of ["ink-900", "ink-950"]) assert.ok((foreground + .05) / (luminance(token(bg)) + .05) >= 3);
});

test("view transitions provide explicit focus destinations without forcing open or resetting the form", () => {
  const source = readFileSync(new URL("./atelier-reservation-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /<summary ref=\{formSummary\}/);
  assert.match(source, /formSummary\.current\.focus\(\)/);
  assert.match(source, /focusAfterTransition\.current = "form"; setChecked\(false\); session\.edit\(\)/);
  assert.match(source, /ref=\{reviewFocus\} tabIndex=\{-1\}/);
  assert.match(source, /submittedForm\.contains\(document\.activeElement\)/);
  assert.match(source, /!submittedForm\.contains\(event\.target\)\) focusReviewAllowed\.current = false/);
  for (const event of ["focusin", "pointerdown"]) {
    assert.ok(source.includes(`document.addEventListener("${event}", movedOutside`));
    assert.ok(source.includes(`document.removeEventListener("${event}", movedOutside`));
  }
  assert.match(source, /if \(focusReviewAllowed\.current\) reviewFocus\.current\.focus\(\)/);
  assert.doesNotMatch(source, /document\.activeElement === document\.body/);
  assert.doesNotMatch(source, /\.open =|\.reset\(\)/);
});
