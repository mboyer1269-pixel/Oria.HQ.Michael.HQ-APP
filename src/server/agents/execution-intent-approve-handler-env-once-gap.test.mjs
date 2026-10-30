#!/usr/bin/env node
// GAP (npm run test:gaps) — Room decision: N8N_WEBHOOK_URL is read ONCE, in the
// approve route's defaultDeps (route.ts), and captured at construction. So:
//  (a) static scan: no file under src/ other than the allowed readers (route.ts
//      defaultDeps, server-env.ts, the n8n smoke CLI; Architecte ruling) reads
//      N8N_WEBHOOK_URL from process.env — directly (process.env.N8N_WEBHOOK_URL,
//      process.env["N8N_WEBHOOK_URL"]) or indirectly (a module that resolves the
//      N8N destination key and falls back to process.env, or parses process.env
//      into a schema declaring N8N_WEBHOOK_URL). Offenders are listed file:line.
//  (b) tests inject the URL through deps: a handler built with
//      createApproveHandler({ ..., webhookEnv }) dispatches to the injected URL,
//      whatever process.env says. SIMULATED: fetch spy, local repo, in-memory
//      G1b decision store.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_DEPS_MODULE = "src/app/api/agents/execution-intents/[intentId]/approve/route.ts";
// Architecte ruling: allowed readers. server-env.ts is the source of
// defaultDeps' configuration; the n8n smoke script is a standalone CLI.
const ALLOWED_READERS = new Set([
  DEFAULT_DEPS_MODULE,
  "src/lib/server-env.ts",
  "src/scripts/smoke/n8n-execution-slice.mjs",
]);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(e.name) && !/\.test\.(mjs|ts|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
const stripComment = (line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? "" : line.replace(/\/\/.*$/, ""));

test("(a) only the defaultDeps module reads N8N_WEBHOOK_URL from process.env (static scan of src/)", async () => {
  const offenders = [];
  for (const file of await walk(path.join(projectRoot, "src"))) {
    const rel = path.relative(projectRoot, file).split(path.sep).join("/");
    if (ALLOWED_READERS.has(rel)) continue;
    const src = await readFile(file, "utf8");
    const mentionsN8nKey = /N8N_WEBHOOK_URL|N8N_DESTINATION_ENV_KEY|destinationEnvKey/.test(src);
    src.split("\n").forEach((raw, i) => {
      const line = stripComment(raw);
      const direct = /process\.env(\.N8N_WEBHOOK_URL\b|\[\s*["'`]N8N_WEBHOOK_URL["'`]\s*\])/.test(line);
      const indirect = mentionsN8nKey && /(\?\?|=)\s*process\.env\b(?!\.)|safeParse\(\s*process\.env\s*\)|parse\(\s*process\.env\s*\)/.test(line);
      if (direct || indirect) offenders.push(`${rel}:${i + 1}: ${raw.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `N8N_WEBHOOK_URL read from process.env outside the allowed readers (${[...ALLOWED_READERS].join(", ")}):\n${offenders.join("\n")}`);
});

test("(b) the URL is injected through deps: createApproveHandler({ webhookEnv }) dispatches to the injected URL, not process.env", async () => {
  const h = await import(path.join(projectRoot, "proofs/approval-route-harness.mjs"));
  const support = await import(path.join(projectRoot, "proofs/approval-decision-test-support.mjs"));
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
  });
  const envBefore = process.env.N8N_WEBHOOK_URL;
  const injected = "http://127.0.0.1:5678/webhook/injected-through-deps";
  const store = support.createDecisionStore();
  const POST = await support.buildApproveHandler(jiti, projectRoot, {
    store,
    webhookEnv: { N8N_WEBHOOK_URL: injected, N8N_SECRET: process.env.N8N_SECRET, AGENT_WEBHOOK_SIGNING_SECRET: process.env.AGENT_WEBHOOK_SIGNING_SECRET },
  });
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => { seen.push(String(url)); return new Response(JSON.stringify({ ok: true, status: "ok" }), { status: 200, headers: { "content-type": "application/json" } }); };
  process.env.N8N_WEBHOOK_URL = "http://127.0.0.1:9/from-process-env";
  try {
    const id = await h.createIntent("env-injected");
    const stored = await h.getIntent(id);
    const hash = h.hashExecutionIntentPayload(stored.payload);
    const decisionId = store.issue(h.WS, id, hash);
    const res = await POST(
      new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedPayloadHash: hash, decisionId }),
      }),
      { params: Promise.resolve({ intentId: id }) },
    );
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    const dispatched = seen.filter((u) => u.includes("127.0.0.1"));
    assert.deepEqual(dispatched, [injected], `dispatch targets: ${JSON.stringify(seen)}`);
    assert.equal(store.isConsumed(decisionId), true);
  } finally {
    globalThis.fetch = original;
    process.env.N8N_WEBHOOK_URL = envBefore;
  }
});
