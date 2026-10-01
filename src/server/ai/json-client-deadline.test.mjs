#!/usr/bin/env node
// Loopback deadline for the two JSON clients. Real fetch to 127.0.0.1 only.
// An injected fetch that ignores AbortSignal is not treated as a covered timeout.
// No provider network and no model call.

import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { generateJsonWithAnthropic } = await jiti.import(
  path.join(projectRoot, "src/server/ai/anthropic-json-client.ts"),
);
const { generateJsonWithOpenAI } = await jiti.import(
  path.join(projectRoot, "src/server/ai/openai-json-client.ts"),
);
const { generateStructuredJson } = await jiti.import(
  path.join(projectRoot, "src/server/ai/llm-json-provider.ts"),
);

const TIMEOUT_MS = 600;
const HANG_BOUND_MS = 2500;

const CLIENTS = [
  {
    name: "anthropic",
    env: "ANTHROPIC_API_KEY",
    modelId: "claude-haiku-4-5-20251001",
    call: generateJsonWithAnthropic,
    body: JSON.stringify({
      content: [{ type: "text", text: JSON.stringify({ reply: "ok" }) }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  },
  {
    name: "openai",
    env: "OPENAI_API_KEY",
    modelId: "gpt-4o-mini",
    call: generateJsonWithOpenAI,
    body: JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ reply: "ok" }) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  },
];

function listen(mode, body) {
  const server = http.createServer((req, res) => {
    req.on("error", () => {});
    res.on("error", () => {});
    req.resume();
    if (mode === "headers") return;
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.flushHeaders();
    if (mode === "body") return;
    res.end(body);
  });
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

function loopbackFetch(port) {
  return (_url, init) => fetch(`http://127.0.0.1:${port}/`, init);
}

function ignoringFetch() {
  return () => new Promise(() => {});
}

async function settle(work, boundMs = HANG_BOUND_MS) {
  const started = performance.now();
  let timer;
  const hang = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ settled: false }), boundMs);
  });
  const outcome = await Promise.race([
    work.then((result) => ({ settled: true, result })),
    hang,
  ]);
  clearTimeout(timer);
  return { ...outcome, elapsed: Math.round(performance.now() - started) };
}

function recordingGate() {
  const state = { status: "none", releaseCalls: 0, reservedCents: null };
  return {
    state,
    async reserve() {
      state.status = "held";
      state.reservedCents = 40;
      return {
        configured: true,
        status: "held",
        currency: "USD",
        reservedCents: 40,
        networkEmitted: false,
        reconciliationRequired: false,
      };
    },
    async markEmitted() {
      state.status = "emitted_unknown";
      return {
        configured: true,
        status: "emitted_unknown",
        currency: "USD",
        reservedCents: 40,
        networkEmitted: true,
        reconciliationRequired: true,
      };
    },
    async release() {
      state.releaseCalls += 1;
      state.status = "released";
      state.reservedCents = null;
      return {
        configured: true,
        status: "released",
        currency: null,
        reservedCents: null,
        networkEmitted: false,
        reconciliationRequired: false,
      };
    },
    async consume() {
      state.status = "consumed";
      return {
        configured: true,
        status: "consumed",
        currency: "USD",
        reservedCents: state.reservedCents,
        networkEmitted: true,
        reconciliationRequired: false,
      };
    },
  };
}

for (const client of CLIENTS) {
  test(`${client.name} loopback deadline covers headers and body`, async () => {
    process.env[client.env] = "synthetic";
    const measured = [];
    try {
      for (const mode of ["headers", "complete", "body"]) {
        const server = await listen(mode, client.body);
        const port = server.address().port;
        try {
          const outcome = await settle(client.call(
            { systemPrompt: "sys", userPrompt: "user", timeoutMs: TIMEOUT_MS, modelId: client.modelId },
            loopbackFetch(port),
          ));
          measured.push(`${mode}=${outcome.elapsed}`);
          assert.equal(outcome.settled, true, `${client.name} ${mode} still pending after ${HANG_BOUND_MS}ms`);
          if (mode === "complete") {
            assert.equal(outcome.result.ok, true);
            assert.equal(outcome.result.json.reply, "ok");
            assert.ok(outcome.elapsed < 400, `complete took ${outcome.elapsed}ms`);
          } else {
            assert.equal(outcome.result.ok, false);
            assert.equal(outcome.result.errorCode, "timeout");
            assert.ok(outcome.elapsed >= TIMEOUT_MS - 50, `${mode} returned early at ${outcome.elapsed}ms`);
            assert.ok(outcome.elapsed < 1500, `${mode} took ${outcome.elapsed}ms`);
          }
        } finally {
          await closeServer(server);
        }
      }
      console.log(`DEADLINE ${client.name} ${measured.join(" ")}`);
    } finally {
      delete process.env[client.env];
    }
  });

  test(`${client.name} injected fetch that ignores AbortSignal stays outside the deadline`, async () => {
    process.env[client.env] = "synthetic";
    try {
      const outcome = await settle(client.call(
        { systemPrompt: "sys", userPrompt: "user", timeoutMs: TIMEOUT_MS, modelId: client.modelId },
        ignoringFetch(),
      ), 1200);
      console.log(`DEADLINE ${client.name} ignored-signal settled=${outcome.settled} elapsed=${outcome.elapsed}`);
      assert.equal(outcome.settled, false);
    } finally {
      delete process.env[client.env];
    }
  });

  test(`${client.name} body timeout after emission keeps the unknown reservation`, async () => {
    process.env.HQ_CALL_RESERVATION = "1";
    process.env[client.env] = "synthetic";
    const server = await listen("body", client.body);
    const port = server.address().port;
    const gate = recordingGate();
    try {
      const outcome = await settle(generateStructuredJson({
        providerPreference: client.name,
        modelId: client.modelId,
        workspaceId: "ws-deadline",
        callSubjectId: `deadline-${client.name}`,
        timeoutMs: TIMEOUT_MS,
        systemPrompt: "sys",
        userPrompt: "user",
        reservationGate: gate,
        fetchFns: { [client.name]: loopbackFetch(port) },
      }));
      console.log(`DEADLINE ${client.name} reservation elapsed=${outcome.elapsed} status=${gate.state.status} releases=${gate.state.releaseCalls}`);
      assert.equal(outcome.settled, true);
      assert.equal(outcome.result.ok, false);
      assert.equal(gate.state.status, "emitted_unknown");
      assert.equal(gate.state.releaseCalls, 0);
      assert.equal(gate.state.reservedCents, 40);
      assert.notEqual(gate.state.reservedCents, 0);
      assert.equal(outcome.result.reservation.status, "emitted_unknown");
      assert.equal(outcome.result.reservation.reconciliationRequired, true);
      assert.equal(outcome.result.reservation.reservedCents, 40);
      assert.equal(outcome.result.cost.kind, "failed_maybe_billed");
      assert.equal(outcome.result.cost.monetaryUsd, null);
      assert.equal(outcome.result.cost.networkRequestSent, true);
    } finally {
      await closeServer(server);
      delete process.env.HQ_CALL_RESERVATION;
      delete process.env[client.env];
    }
  });
}
