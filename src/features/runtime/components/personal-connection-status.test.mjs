import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, fsCache: false, alias: { "@": path.join(process.cwd(), "src") } });
const { PersonalConnectionStatusPanel } = await jiti.import("./personal-connection-status.tsx");
const render = status => renderToStaticMarkup(createElement(PersonalConnectionStatusPanel, { status }));
const scope = { workspaceRef: "workspace-a", ownerActorRef: "reader-private-reference" };
const configured = {
  status: "configured", scope,
  connection: { provider: "claude", runnerRef: "runner-approved", adapterStatus: "implemented", accountRef: "11111111-1111-4111-8111-111111111111",
    evidenceStatus: "observed", confirmationTransport: "persisted", confirmationReadiness: "not_verified", chatStatus: "unavailable", missionStatus: "not_verified" },
};

test("a fresh account observation never presents mission or chat access as verified", () => {
  const html = render(configured);
  assert.match(html, /Preuve fraîche observée/);
  assert.match(html, /Non vérifiée par cette vue/);
  assert.match(html, /Transport à raccorder/);
  assert.match(html, /plusieurs comptes ou hôtes reste à raccorder/);
  assert.doesNotMatch(html, /reader-private-reference|<button|<input|<form/);
});

test("unsupported adapters and stale evidence show the action still required", () => {
  const unsupported = render({ ...configured, connection: { ...configured.connection, provider: "codex", adapterStatus: "unavailable", accountRef: null, evidenceStatus: "not_checked" } });
  assert.match(unsupported, /Codex/); assert.match(unsupported, /Raccorder et qualifier l’adaptateur/);
  const stale = render({ ...configured, connection: { ...configured.connection, accountRef: null, evidenceStatus: "stale", confirmationTransport: "operator_probe" } });
  assert.match(stale, /périmée ou datée dans le futur/);
  assert.match(stale, /Non attestée/);
  assert.match(stale, /Faire actualiser la preuve/);
  assert.match(stale, /environnement opérateur/);
});

test("missing, denied and unavailable states expose no connection or actor reference", () => {
  for (const state of ["not_configured", "unavailable", "access_denied", "invalid_context"]) {
    const html = render({ status: state, scope, connection: null });
    assert.match(html, state === "not_configured" ? /Aucun raccordement fournisseur configuré/ : /État du raccordement indisponible/);
    assert.doesNotMatch(html, /reader-private-reference|runner-approved|11111111|<button|<input|<form/);
  }
});
