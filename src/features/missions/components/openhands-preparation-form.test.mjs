import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import ts from "typescript";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { fsCache: false });
const preparation = await jiti.import("../openhands-preparation.ts");
const require = createRequire(import.meta.url);
const mission = { id: "77777777-7777-4777-8777-777777777777", workspaceId: "simulation", updatedAt: "2026-10-28T12:00:00Z", input: {} };
const values = { commitSha: "a".repeat(40), executorVersion: "1.2.3", maxCostCents: "25", maxTokens: "300", maxIterations: "4", timeoutSeconds: "90" };
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
const text = tree => typeof tree === "string" ? tree : Array.isArray(tree) ? tree.map(text).join("") : text(tree?.props?.children ?? "");

// Component-event simulation, not a browser/Next integration: actual component and
// wire validator; only React scheduling, FormData, router, storage and fetch are DI.
// Removing draft capture or a field's defaultValue must fail this regression.
test("prepare → edit preserves every field, reprepare uses edits and requires fresh confirmation", async () => {
  const slots = []; let cursor = 0; const effects = [];
  const useState = initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; };
  const react = { createElement, useState, useRef: initial => useState(() => ({ current: initial }))[0],
    useEffect: effect => { const index = cursor++; if (!(index in slots)) { slots[index] = true; effects.push(effect); } } };
  const source = readFileSync(new URL("./openhands-preparation.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => {
    if (name === "react") return react;
    if (name === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
    if (name === "../openhands-preparation") return preparation;
    if (name === "../openhands-memory") return { loadOpenHandsMemoryProjects: async () => [], attachOpenHandsMemory: async () => { throw Error("unexpected memory write"); } };
    return require(name);
  }, compiledModule, compiledModule.exports);
  const original = { fetch: globalThis.fetch, FormData: globalThis.FormData, sessionStorage: globalThis.sessionStorage };
  const calls = [];
  const stored = new Map();
  globalThis.sessionStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  globalThis.FormData = class { constructor(form) { this.values = form; } get(key) { return this.values[key] ?? null; } };
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body); calls.push(request);
    if (request.action === "confirm") throw Error("simulated lost confirmation response");
    assert.equal(request.action, "prepare");
    const hash = "b".repeat(64);
    return Response.json({ status: "prepared", externalEffectAllowed: false, dossier: { contractVersion: 1, executor: "openhands", executorVersion: request.executorVersion,
      mission: { id: mission.id, workspaceId: mission.workspaceId, modeId: "development", version: mission.updatedAt, title: "Simulation", objective: "Simulation", scope: "Fixture", acceptanceCriteria: "Preserve inputs", expectedOutput: "Test", createdBy: "simulation" },
      source: { commitSha: request.commitSha, commitVerification: "not_verified" }, budget: request.budget, approvalRequired: true, executionRequested: false,
      idempotencyKey: `hq-openhands-v1-${hash}`, payloadHash: hash } });
  };
  const render = () => { cursor = 0; return compiledModule.exports.OpenHandsPreparation({ mission, source: "supabase", enabled: true }); };
  const find = (tree, type, label) => nodes(tree).find(node => node.type === type && (!label || text(node).includes(label)));
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
  try {
    render(); effects.forEach(effect => effect()); await new Promise(resolve => setTimeout(resolve, 5));
    let tree = render();
    await find(tree, "form").props.onSubmit({ preventDefault() {}, currentTarget: values, nativeEvent: {} }); await flush();
    tree = render(); assert.equal(find(tree, "form"), undefined);
    const checkbox = nodes(tree).find(node => node.type === "input" && node.props.type === "checkbox");
    checkbox.props.onChange({ target: { checked: true } }); tree = render();
    find(tree, "button", "Modifier la préparation").props.onClick(); tree = render();
    const restored = Object.fromEntries(nodes(find(tree, "form")).filter(node => node.type === "input").map(node => [node.props.name, String(node.props.defaultValue ?? "")]));
    assert.deepEqual(restored, values);
    assert.equal(calls.length, 1, "editing must not send or reserve anything");
    const changed = { ...restored, maxTokens: "301" };
    await find(tree, "form").props.onSubmit({ preventDefault() {}, currentTarget: changed, nativeEvent: {} }); await flush();
    tree = render(); assert.equal(calls.length, 2); assert.equal(calls[1].budget.maxTokens, 301);
    assert.equal(find(tree, "button", "Enregistrer l’autorisation").props.disabled, true);
    find(tree, "button", "Modifier la préparation").props.onClick(); tree = render();
    assert.equal(String(nodes(tree).find(node => node.props?.name === "maxTokens").props.defaultValue), "301");
    await find(tree, "form").props.onSubmit({ preventDefault() {}, currentTarget: changed, nativeEvent: {} }); await flush();
    tree = render(); nodes(tree).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
    tree = render(); find(tree, "button", "Enregistrer l’autorisation").props.onClick(); await flush();
    tree = render();
    assert.equal(find(tree, "form"), undefined, "an uncertain confirmation must not reopen the retained draft");
    assert.equal(find(tree, "button", "Modifier la préparation"), undefined);
    assert.ok(find(tree, "button", "Vérifier le reçu"));
    assert.equal(calls.filter(call => call.action === "confirm").length, 1);
    assert.equal(stored.size, 1, "uncertainty keeps the recovery packet");
  } finally { Object.assign(globalThis, original); }
});
