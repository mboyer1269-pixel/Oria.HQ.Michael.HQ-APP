#!/usr/bin/env node
// USD-cent reservation contract. Injected gate and injected fetch only.
// The gate below is not production. The SQL race is proofs/prove-call-reservation-real-db.mjs.
// No provider network.

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

const { accessClassForModel, callReservationConfigured } = await jiti.import(
  path.join(projectRoot, "src/server/ai/call-reservation.ts"),
);
const { generateStructuredJson } = await jiti.import(
  path.join(projectRoot, "src/server/ai/llm-json-provider.ts"),
);
const { DURABLE_BUDGET_IMPLEMENTED } = await jiti.import(
  path.join(projectRoot, "src/server/ai/call-accounting.ts"),
);
const { RUNG_COST_WEIGHT } = await jiti.import(
  path.join(projectRoot, "src/server/ai/cost-ladder.ts"),
);
const { ANTHROPIC_JSON_DEFAULT_MAX_TOKENS, ANTHROPIC_JSON_DEFAULT_MODEL } = await jiti.import(
  path.join(projectRoot, "src/server/ai/anthropic-json-client.ts"),
);
const { OPENAI_JSON_DEFAULT_MAX_TOKENS, OPENAI_JSON_DEFAULT_MODEL } = await jiti.import(
  path.join(projectRoot, "src/server/ai/openai-json-client.ts"),
);

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";
const MINI = "gpt-4o-mini";

const FAR_FUTURE_MS = Date.now() + 86_400_000;

function quoteRow(cents, extra = {}) {
  return {
    cents,
    reliable: true,
    scope: "prompt_system_output",
    version: "fixture",
    validUntilMs: FAR_FUTURE_MS,
    coversInputBytes: 100_000,
    coversOutputTokens: 2048,
    ...extra,
  };
}

function standardQuotes() {
  return new Map([
    [`anthropic|${ANTHROPIC_JSON_DEFAULT_MODEL}`, quoteRow(80, { coversOutputTokens: ANTHROPIC_JSON_DEFAULT_MAX_TOKENS })],
    [`openai|${OPENAI_JSON_DEFAULT_MODEL}`, quoteRow(40, { coversOutputTokens: OPENAI_JSON_DEFAULT_MAX_TOKENS })],
    [`anthropic|${HAIKU}`, quoteRow(80)],
    [`openai|${MINI}`, quoteRow(40)],
    [`anthropic|${SONNET}`, quoteRow(200)],
    ["openai|gpt-4o", quoteRow(200, { reliable: false })],
  ]);
}

function quoteCovers(quote, input) {
  if (!quote || quote.reliable !== true || quote.cents <= 0) return false;
  if (quote.scope !== "prompt_system_output") return false;
  if (typeof quote.version !== "string" || quote.version.length < 1) return false;
  if (typeof quote.validUntilMs !== "number" || quote.validUntilMs <= Date.now()) return false;
  if (typeof quote.coversInputBytes !== "number" || quote.coversInputBytes < input.inputBytes) return false;
  if (typeof quote.coversOutputTokens !== "number" || quote.coversOutputTokens < input.maxTokens) return false;
  return true;
}

/** Synchronous stand-in for hq_reserve_call_attempt. Not the production store. */
function memoryGate(ceilings, quotes) {
  const rights = new Map();
  const rows = new Map();
  const rightKey = (workspaceId, subjectId) => `${workspaceId}|${subjectId}`;
  const rowKey = (input) => `${input.workspaceId}|${input.subjectId}|${input.provider}`;
  const used = (workspaceId) => [...rows.values()]
    .filter((row) => row.workspaceId === workspaceId && row.state !== "released")
    .reduce((sum, row) => sum + row.reservedCents, 0);
  const active = (workspaceId, subjectId) => [...rows.values()].some((row) =>
    row.workspaceId === workspaceId && row.subjectId === subjectId && row.state !== "released");
  const snap = (status, extra = {}) => ({
    configured: true,
    status,
    currency: null,
    reservedCents: null,
    networkEmitted: false,
    reconciliationRequired: false,
    ...extra,
  });
  return {
    rows,
    rights,
    async reserve(input) {
      if ("relativeWeight" in input || "reservedCents" in input || "amountCents" in input || "monetaryUsd" in input) {
        throw new Error("amount must come from the server quote");
      }
      if (!ceilings.has(input.workspaceId)) return snap("unavailable", { reason: "ceiling_not_configured" });
      const quote = quotes.get(`${input.provider}|${input.modelId}`);
      if (!quoteCovers(quote, input)) {
        return snap("refused", { reason: "estimate_insufficient" });
      }
      const owner = rights.get(rightKey(input.workspaceId, input.subjectId));
      if (owner && owner !== input.callerId && active(input.workspaceId, input.subjectId)) {
        return snap("lost", { reason: "emit_right_held" });
      }
      rights.set(rightKey(input.workspaceId, input.subjectId), input.callerId);
      const existing = rows.get(rowKey(input));
      if (existing && existing.state !== "released") {
        return snap("duplicate", {
          currency: "USD",
          reservedCents: existing.reservedCents,
          networkEmitted: existing.networkEmitted,
          reconciliationRequired: existing.reconciliationRequired,
        });
      }
      if (used(input.workspaceId) + quote.cents > ceilings.get(input.workspaceId)) {
        return snap("refused", { reason: "ceiling_exhausted" });
      }
      rows.set(rowKey(input), {
        ...input,
        state: "held",
        currency: "USD",
        reservedCents: quote.cents,
        networkEmitted: false,
        reconciliationRequired: false,
      });
      return snap("held", { currency: "USD", reservedCents: quote.cents });
    },
    async release(input) {
      const row = rows.get(rowKey(input));
      if (!row) return snap("unavailable", { reason: "not_found" });
      if (row.callerId !== input.callerId || row.networkEmitted || row.state !== "held") {
        return snap(row.state, {
          reason: "release_refused",
          currency: row.networkEmitted ? "USD" : null,
          reservedCents: row.networkEmitted ? row.reservedCents : null,
          networkEmitted: row.networkEmitted,
          reconciliationRequired: row.reconciliationRequired,
        });
      }
      row.state = "released";
      return snap("released");
    },
    async markEmitted(input) {
      const row = rows.get(rowKey(input));
      if (!row || row.callerId !== input.callerId || row.state !== "held" || row.networkEmitted) {
        return snap("refused", { reason: "not_held" });
      }
      row.state = "emitted_unknown";
      row.networkEmitted = true;
      row.reconciliationRequired = true;
      return snap("emitted_unknown", {
        currency: "USD",
        reservedCents: row.reservedCents,
        networkEmitted: true,
        reconciliationRequired: true,
      });
    },
    async consume(input) {
      const row = rows.get(rowKey(input));
      if (!row || row.callerId !== input.callerId || row.state !== "emitted_unknown") {
        return snap("refused", { reason: "not_emitted" });
      }
      row.state = "consumed";
      row.reconciliationRequired = false;
      return snap("consumed", {
        currency: "USD",
        reservedCents: row.reservedCents,
        networkEmitted: true,
        reconciliationRequired: false,
      });
    },
  };
}

function okFetch(payload) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify(payload) }],
      usage: { input_tokens: 2, output_tokens: 3 },
    }),
  });
}

test("access classes stay distinct and weights are not a monetary reserve", () => {
  assert.equal(accessClassForModel("gpt-4o-mini"), "api");
  assert.equal(accessClassForModel("claude-sonnet-4-6"), "api");
  assert.equal(accessClassForModel("local-runtime"), "local");
  assert.equal(accessClassForModel("subscription-plan"), "subscription");
  assert.equal(accessClassForModel("gemini-flash"), "unknown");
  assert.equal(accessClassForModel("constructor"), "unknown");
  assert.equal(RUNG_COST_WEIGHT.premium, 5);
  assert.equal(RUNG_COST_WEIGHT.economy, 1);
  assert.equal(callReservationConfigured({}), false);
  assert.equal(callReservationConfigured({ HQ_CALL_RESERVATION: "true" }), false);
  assert.equal(callReservationConfigured({ HQ_CALL_RESERVATION: "1" }), true);
  assert.equal(DURABLE_BUDGET_IMPLEMENTED, false);
});

test("an unconfigured ledger does not block and does not claim a ceiling", async () => {
  delete process.env.HQ_CALL_RESERVATION;
  process.env.ANTHROPIC_API_KEY = "synthetic";
  let calls = 0;
  try {
    const result = await generateStructuredJson({
      providerPreference: "anthropic",
      modelId: HAIKU,
      workspaceId: "ws-a",
      callSubjectId: "call-unconfigured",
      systemPrompt: "sys",
      userPrompt: "user",
      fetchFns: {
        anthropic: async () => {
          calls += 1;
          return okFetch({ reply: "ok" })();
        },
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.reservation.configured, false);
    assert.equal(result.reservation.status, "unavailable");
    assert.equal(result.reservation.currency, null);
    assert.equal(result.reservation.reservedCents, null);
    assert.equal(result.cost.monetaryUsd, null);
    assert.equal(result.cost.relativeWeight, undefined);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("budgeted mode without a subject, ceiling, or reliable quote does not emit", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "synthetic";
  const gate = memoryGate(new Map([["ws-a", 1000]]), standardQuotes());
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    throw new Error("network must not be used");
  };
  try {
    const missingSubject = await generateStructuredJson({
      providerPreference: "auto",
      modelId: MINI,
      workspaceId: "ws-a",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: { anthropic: fetchFn, openai: fetchFn },
    });
    assert.equal(calls, 0);
    assert.equal(missingSubject.ok, false);
    assert.equal(missingSubject.errorCode, "reservation_blocked");
    assert.equal(missingSubject.reservation.reason, "identity");
    assert.equal(missingSubject.cost.networkRequestSent, false);
    assert.equal(missingSubject.cost.monetaryUsd, null);

    const missingCeiling = await generateStructuredJson({
      providerPreference: "openai",
      modelId: MINI,
      workspaceId: "ws-missing",
      callSubjectId: "call-no-ceiling",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: { anthropic: fetchFn, openai: fetchFn },
    });
    assert.equal(calls, 0);
    assert.equal(missingCeiling.reservation.status, "unavailable");
    assert.equal(missingCeiling.reservation.reason, "ceiling_not_configured");
    assert.equal(gate.rows.size, 0);

    const missingQuote = await generateStructuredJson({
      providerPreference: "openai",
      modelId: "gpt-4o",
      workspaceId: "ws-a",
      callSubjectId: "call-no-quote",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: { anthropic: fetchFn, openai: fetchFn },
    });
    assert.equal(calls, 0);
    assert.equal(missingQuote.reservation.reason, "estimate_insufficient");
    assert.equal(missingQuote.reservation.reservedCents, null);
    assert.equal(gate.rows.size, 0);

    const uncovered = await generateStructuredJson({
      providerPreference: "openai",
      modelId: MINI,
      maxTokens: OPENAI_JSON_DEFAULT_MAX_TOKENS + 1,
      workspaceId: "ws-a",
      callSubjectId: "call-uncovered",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: { anthropic: fetchFn, openai: fetchFn },
    });
    assert.equal(calls, 0);
    assert.equal(uncovered.reservation.reason, "estimate_insufficient");
    assert.equal(gate.rows.size, 0);
  } finally {
    delete process.env.HQ_CALL_RESERVATION;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  }
});

test("a ceiling the size of a routing weight does not authorize a send", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  const gate = memoryGate(new Map([["ws-a", RUNG_COST_WEIGHT.premium]]), standardQuotes());
  let calls = 0;
  try {
    const result = await generateStructuredJson({
      providerPreference: "anthropic",
      modelId: SONNET,
      workspaceId: "ws-a",
      callSubjectId: "call-weight",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: {
        anthropic: async () => {
          calls += 1;
          throw new Error("weight must not buy a send");
        },
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.reservation.reason, "ceiling_exhausted");
    assert.equal(result.reservation.reservedCents, null);
    assert.equal(result.cost.monetaryUsd, null);
    assert.equal(result.cost.relativeWeight, undefined);
    assert.equal(gate.rows.size, 0);
    assert.notEqual(standardQuotes().get(`anthropic|${SONNET}`).cents, RUNG_COST_WEIGHT.premium);
  } finally {
    delete process.env.HQ_CALL_RESERVATION;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("one caller wins the emit right, and the loser cannot take the fallback", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "synthetic";
  const gate = memoryGate(new Map([["ws-a", 1000], ["ws-b", 1000]]), standardQuotes());
  let releaseAnthropic;
  let winnerFetches = 0;
  let loserFetches = 0;
  const entered = new Promise((resolve) => {
    releaseAnthropic = { resolveEntered: resolve };
  });
  try {
    const winner = generateStructuredJson({
      providerPreference: "auto",
      workspaceId: "ws-a",
      callSubjectId: "mission-1",
      paidFallback: { authorized: true, workspaceId: "ws-a" },
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: {
        anthropic: async () => {
          winnerFetches += 1;
          let release;
          const hold = new Promise((resolve) => {
            release = resolve;
          });
          releaseAnthropic.release = release;
          releaseAnthropic.resolveEntered();
          await hold;
          return { ok: false, status: 503, json: async () => ({}) };
        },
        openai: async () => {
          winnerFetches += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: JSON.stringify({ reply: "ok" }) } }],
              usage: { prompt_tokens: 2, completion_tokens: 3 },
            }),
          };
        },
      },
    });
    await entered;
    const loser = await generateStructuredJson({
      providerPreference: "auto",
      workspaceId: "ws-a",
      callSubjectId: "mission-1",
      paidFallback: { authorized: true, workspaceId: "ws-a" },
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: {
        anthropic: async () => {
          loserFetches += 1;
          throw new Error("loser must not emit");
        },
        openai: async () => {
          loserFetches += 1;
          throw new Error("loser must not emit the fallback");
        },
      },
    });
    assert.equal(loserFetches, 0);
    assert.equal(loser.ok, false);
    assert.equal(loser.reservation.status, "lost");
    assert.equal(loser.reservation.reason, "emit_right_held");
    assert.equal(loser.cost.networkRequestSent, false);
    releaseAnthropic.release();
    const won = await winner;
    assert.equal(won.ok, true);
    assert.equal(won.fallbackUsed, true);
    assert.equal(winnerFetches, 2);
    assert.equal(won.reservation.currency, "USD");
    assert.equal(won.reservation.reservedCents, 40);
    assert.equal(won.reservation.status, "consumed");
    assert.equal(won.cost.kind, "unknown_cost");
    assert.equal(won.cost.monetaryUsd, null);
    assert.notEqual(won.reservation.reservedCents, 0);
    const states = [...gate.rows.values()]
      .filter((row) => row.workspaceId === "ws-a")
      .map((row) => `${row.provider}:${row.state}:${row.reservedCents}`)
      .sort();
    assert.deepEqual(states, ["anthropic:emitted_unknown:80", "openai:consumed:40"]);
    assert.equal(gate.rights.size, 1);

    let otherCalls = 0;
    const other = await generateStructuredJson({
      providerPreference: "openai",
      modelId: MINI,
      workspaceId: "ws-b",
      callSubjectId: "mission-1",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: {
        openai: async () => {
          otherCalls += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: JSON.stringify({ reply: "ok" }) } }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
          };
        },
      },
    });
    assert.equal(other.ok, true);
    assert.equal(otherCalls, 1);
    assert.equal(other.reservation.reservedCents, 40);
  } finally {
    delete process.env.HQ_CALL_RESERVATION;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  }
});

test("a missing key reserves nothing, and a timeout after emission is not released", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  delete process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic";
  const gate = memoryGate(new Map([["ws-a", 1000]]), standardQuotes());
  let calls = 0;
  try {
    const missingKey = await generateStructuredJson({
      providerPreference: "anthropic",
      modelId: HAIKU,
      workspaceId: "ws-a",
      callSubjectId: "call-nokey",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: {
        anthropic: async () => {
          calls += 1;
          throw new Error("must not fetch");
        },
      },
    });
    assert.equal(calls, 0);
    assert.equal(missingKey.reservation.reason, "no_api_key");
    assert.equal(missingKey.cost.networkRequestSent, false);
    assert.equal(gate.rows.size, 0);

    const timedOut = await generateStructuredJson({
      providerPreference: "openai",
      modelId: MINI,
      workspaceId: "ws-a",
      callSubjectId: "call-timeout",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: {
        openai: async () => {
          calls += 1;
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        },
      },
    });
    assert.equal(calls, 1);
    assert.equal(timedOut.ok, false);
    assert.equal(timedOut.cost.kind, "failed_maybe_billed");
    assert.equal(timedOut.cost.monetaryUsd, null);
    assert.notEqual(timedOut.cost.monetaryUsd, 0);
    const row = [...gate.rows.values()][0];
    assert.equal(row.state, "emitted_unknown");
    assert.equal(row.reconciliationRequired, true);
    assert.equal(row.networkEmitted, true);
    assert.equal(row.reservedCents, 40);
    assert.notEqual(row.reservedCents, 0);
    assert.equal(Object.hasOwn(gate, "expire"), false);
  } finally {
    delete process.env.HQ_CALL_RESERVATION;
    delete process.env.OPENAI_API_KEY;
  }
});

test("an exhausted quote ceiling blocks the authorized fallback without releasing the first hold", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "synthetic";
  const narrow = memoryGate(new Map([["ws-a", 80]]), standardQuotes());
  let openaiCalls = 0;
  try {
    const blocked = await generateStructuredJson({
      providerPreference: "auto",
      workspaceId: "ws-a",
      callSubjectId: "call-fallback-tight",
      paidFallback: { authorized: true, workspaceId: "ws-a" },
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: narrow,
      fetchFns: {
        anthropic: async () => ({ ok: false, status: 503, json: async () => ({}) }),
        openai: async () => {
          openaiCalls += 1;
          throw new Error("second provider must not emit");
        },
      },
    });
    assert.equal(openaiCalls, 0);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reservation.reason, "ceiling_exhausted");
    assert.equal([...narrow.rows.values()].filter((row) => row.provider === "openai").length, 0);
    const held = [...narrow.rows.values()][0];
    assert.equal(held.provider, "anthropic");
    assert.equal(held.state, "emitted_unknown");
    assert.equal(held.reservedCents, 80);
    assert.equal(held.reconciliationRequired, true);
  } finally {
    delete process.env.HQ_CALL_RESERVATION;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  }
});

test("a quote that does not bound prompt, system and output does not emit", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.OPENAI_API_KEY = "synthetic";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  const quotes = new Map([
    ["openai|gpt-4o-mini", quoteRow(40, { coversInputBytes: 4 })],
    ["openai|gpt-4o", quoteRow(40, { validUntilMs: Date.now() - 1000 })],
    ["anthropic|claude-haiku-4-5-20251001", quoteRow(80, { version: "" })],
  ]);
  const gate = memoryGate(new Map([["ws-a", 1000]]), quotes);
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    throw new Error("network must not be used");
  };
  try {
    const tooLarge = await generateStructuredJson({
      providerPreference: "openai",
      modelId: MINI,
      workspaceId: "ws-a",
      callSubjectId: "call-input-bound",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: { openai: fetchFn, anthropic: fetchFn },
    });
    assert.equal(calls, 0);
    assert.equal(tooLarge.reservation.reason, "estimate_insufficient");
    assert.equal(tooLarge.reservation.reservedCents, null);
    assert.equal(gate.rows.size, 0);

    const expired = await generateStructuredJson({
      providerPreference: "openai",
      modelId: "gpt-4o",
      workspaceId: "ws-a",
      callSubjectId: "call-expired-quote",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: { openai: fetchFn, anthropic: fetchFn },
    });
    assert.equal(calls, 0);
    assert.equal(expired.reservation.reason, "estimate_insufficient");

    const unversioned = await generateStructuredJson({
      providerPreference: "anthropic",
      modelId: HAIKU,
      workspaceId: "ws-a",
      callSubjectId: "call-unversioned-quote",
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: { openai: fetchFn, anthropic: fetchFn },
    });
    assert.equal(calls, 0);
    assert.equal(unversioned.reservation.reason, "estimate_insufficient");
    assert.equal(gate.rows.size, 0);
  } finally {
    delete process.env.HQ_CALL_RESERVATION;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("a lost mark response is not announced as released and opens no socket", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "synthetic";
  const server = http.createServer((req, res) => {
    req.resume();
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  let sockets = 0;
  server.on("connection", () => {
    sockets += 1;
  });
  const rows = new Map();
  const gate = {
    rows,
    async reserve(input) {
      const row = {
        ...input,
        state: "held",
        reservedCents: 40,
        networkEmitted: false,
        reconciliationRequired: false,
      };
      rows.set(input.provider, row);
      return {
        configured: true,
        status: "held",
        currency: "USD",
        reservedCents: 40,
        networkEmitted: false,
        reconciliationRequired: false,
      };
    },
    async markEmitted(input) {
      const row = rows.get(input.provider);
      row.state = "emitted_unknown";
      row.networkEmitted = true;
      row.reconciliationRequired = true;
      return {
        configured: true,
        status: "unavailable",
        reason: "malformed",
        currency: null,
        reservedCents: null,
        networkEmitted: false,
        reconciliationRequired: false,
      };
    },
    async release(input) {
      const row = rows.get(input.provider);
      return {
        configured: true,
        status: row.state,
        reason: "release_refused",
        currency: "USD",
        reservedCents: row.reservedCents,
        networkEmitted: true,
        reconciliationRequired: true,
      };
    },
    async consume() {
      throw new Error("consume must not run");
    },
  };
  const fetchFn = (_url, init) => fetch(`http://127.0.0.1:${port}/`, init);
  try {
    const result = await generateStructuredJson({
      providerPreference: "auto",
      workspaceId: "ws-a",
      callSubjectId: "call-lost-mark",
      paidFallback: { authorized: true, workspaceId: "ws-a" },
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: { anthropic: fetchFn, openai: fetchFn },
    });
    assert.equal(sockets, 0);
    assert.equal(result.ok, false);
    assert.equal(result.reservation.status, "emitted_unknown");
    assert.notEqual(result.reservation.status, "released");
    assert.equal(result.reservation.reason, "mark_unconfirmed");
    assert.equal(result.reservation.currency, "USD");
    assert.equal(result.reservation.reservedCents, 40);
    assert.notEqual(result.reservation.reservedCents, 0);
    assert.equal(result.reservation.reconciliationRequired, true);
    assert.equal(result.reservation.networkEmitted, true);
    assert.equal(result.cost.networkRequestSent, false);
    assert.equal(result.cost.monetaryUsd, null);
    const row = rows.get("anthropic");
    assert.equal(row.state, "emitted_unknown");
    assert.equal(row.reservedCents, 40);
    assert.equal(row.reconciliationRequired, true);
    assert.equal(rows.has("openai"), false);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve()));
    delete process.env.HQ_CALL_RESERVATION;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  }
});

test("a rejected or unavailable registry does not throw, emit, or drop known cents", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "synthetic";
  const held = {
    configured: true,
    status: "held",
    currency: "USD",
    reservedCents: 40,
    networkEmitted: false,
    reconciliationRequired: false,
  };
  const marked = {
    configured: true,
    status: "emitted_unknown",
    currency: "USD",
    reservedCents: 40,
    networkEmitted: true,
    reconciliationRequired: true,
  };
  const unavailable = {
    configured: true,
    status: "unavailable",
    reason: "malformed",
    currency: null,
    reservedCents: null,
    networkEmitted: false,
    reconciliationRequired: false,
  };

  async function call(gate, allowSocket) {
    let emissions = 0;
    const fetchFn = async () => {
      emissions += 1;
      if (!allowSocket) throw new Error("socket opened");
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: "text", text: JSON.stringify({ reply: "kept" }) }] }),
      };
    };
    const result = await generateStructuredJson({
      providerPreference: "auto",
      workspaceId: "ws-a",
      callSubjectId: "call-registry",
      paidFallback: { authorized: true, workspaceId: "ws-a" },
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: gate,
      fetchFns: { anthropic: fetchFn, openai: fetchFn },
    });
    return { result, emissions };
  }

  try {
    const reserveRejected = await call({
      reserve() { return Promise.reject(new Error("reserve rejected")); },
      markEmitted() { return Promise.reject(new Error("mark must not run")); },
      release() { return Promise.reject(new Error("release must not run")); },
      consume() { return Promise.reject(new Error("consume must not run")); },
    }, false);
    assert.equal(reserveRejected.emissions, 0);
    assert.equal(reserveRejected.result.ok, false);
    assert.equal(reserveRejected.result.errorCode, "reservation_blocked");
    assert.equal(reserveRejected.result.attempts.length, 1);
    assert.equal(reserveRejected.result.reservation.status, "unavailable");
    assert.equal(reserveRejected.result.reservation.reason, "store_unavailable");
    assert.equal(reserveRejected.result.reservation.reservedCents, null);
    assert.notEqual(reserveRejected.result.reservation.status, "released");
    assert.equal(reserveRejected.result.cost.networkRequestSent, false);

    const reserveUnavailable = await call({
      reserve() { return Promise.resolve(unavailable); },
      markEmitted() { return Promise.reject(new Error("mark must not run")); },
      release() { return Promise.reject(new Error("release must not run")); },
      consume() { return Promise.reject(new Error("consume must not run")); },
    }, false);
    assert.equal(reserveUnavailable.emissions, 0);
    assert.equal(reserveUnavailable.result.ok, false);
    assert.equal(reserveUnavailable.result.errorCode, "reservation_blocked");
    assert.equal(reserveUnavailable.result.attempts.length, 1);
    assert.equal(reserveUnavailable.result.reservation.status, "unavailable");
    assert.equal(reserveUnavailable.result.reservation.reason, "malformed");
    assert.equal(reserveUnavailable.result.cost.networkRequestSent, false);

    for (const mode of ["reject", "unavailable"]) {
      const markLost = await call({
        reserve() { return Promise.resolve(held); },
        markEmitted() {
          return mode === "reject"
            ? Promise.reject(new Error("mark rejected"))
            : Promise.resolve(unavailable);
        },
        release() {
          return mode === "reject"
            ? Promise.reject(new Error("release rejected"))
            : Promise.resolve(unavailable);
        },
        consume() { return Promise.reject(new Error("consume must not run")); },
      }, false);
      assert.equal(markLost.emissions, 0, mode);
      assert.equal(markLost.result.ok, false);
      assert.equal(markLost.result.attempts.length, 1, mode);
      assert.equal(markLost.result.reservation.status, "emitted_unknown", mode);
      assert.notEqual(markLost.result.reservation.status, "released", mode);
      assert.equal(markLost.result.reservation.reason, "mark_unconfirmed", mode);
      assert.equal(markLost.result.reservation.currency, "USD", mode);
      assert.equal(markLost.result.reservation.reservedCents, 40, mode);
      assert.notEqual(markLost.result.reservation.reservedCents, 0, mode);
      assert.equal(markLost.result.reservation.reconciliationRequired, true, mode);
      assert.equal(markLost.result.reservation.networkEmitted, true, mode);
      assert.equal(markLost.result.cost.networkRequestSent, false, mode);
      assert.equal(markLost.result.cost.monetaryUsd, null, mode);
    }

    for (const mode of ["reject", "unavailable"]) {
      const consumed = await call({
        reserve() { return Promise.resolve(held); },
        markEmitted() { return Promise.resolve(marked); },
        release() { return Promise.reject(new Error("release must not run")); },
        consume() {
          return mode === "reject"
            ? Promise.reject(new Error("consume rejected"))
            : Promise.resolve(unavailable);
        },
      }, true);
      assert.equal(consumed.emissions, 1, mode);
      assert.equal(consumed.result.ok, true, mode);
      assert.equal(consumed.result.attempts.length, 1, mode);
      assert.equal(consumed.result.fallbackUsed, false, mode);
      assert.deepEqual(consumed.result.json, { reply: "kept" }, mode);
      assert.equal(consumed.result.reservation.status, "emitted_unknown", mode);
      assert.notEqual(consumed.result.reservation.status, "released", mode);
      assert.equal(consumed.result.reservation.reason, "consume_unconfirmed", mode);
      assert.equal(consumed.result.reservation.currency, "USD", mode);
      assert.equal(consumed.result.reservation.reservedCents, 40, mode);
      assert.notEqual(consumed.result.reservation.reservedCents, 0, mode);
      assert.equal(consumed.result.reservation.reconciliationRequired, true, mode);
      assert.equal(consumed.result.cost.kind, "unknown_cost", mode);
      assert.equal(consumed.result.cost.networkRequestSent, true, mode);
      assert.notEqual(consumed.result.cost.kind, "refused", mode);
      assert.equal(consumed.result.cost.monetaryUsd, null, mode);
    }
  } finally {
    delete process.env.HQ_CALL_RESERVATION;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  }
});

test("a blocked authorized fallback keeps the first emitted attempt in the aggregate cost", async () => {
  process.env.HQ_CALL_RESERVATION = "1";
  process.env.ANTHROPIC_API_KEY = "synthetic";
  process.env.OPENAI_API_KEY = "synthetic";
  const held = {
    configured: true,
    status: "held",
    currency: "USD",
    reservedCents: 40,
    networkEmitted: false,
    reconciliationRequired: false,
  };
  const marked = {
    configured: true,
    status: "emitted_unknown",
    currency: "USD",
    reservedCents: 40,
    networkEmitted: true,
    reconciliationRequired: true,
  };
  const unavailable = {
    configured: true,
    status: "unavailable",
    reason: "malformed",
    currency: null,
    reservedCents: null,
    networkEmitted: false,
    reconciliationRequired: false,
  };

  async function run(primary, registry) {
    let emissions = 0;
    const result = await generateStructuredJson({
      providerPreference: "auto",
      workspaceId: "ws-a",
      callSubjectId: "call-blocked-cost",
      paidFallback: { authorized: true, workspaceId: "ws-a" },
      systemPrompt: "sys",
      userPrompt: "user",
      reservationGate: {
        reserve(input) {
          if (input.provider === "openai") {
            return registry === "reject"
              ? Promise.reject(new Error("registry rejected"))
              : Promise.resolve(unavailable);
          }
          return Promise.resolve(held);
        },
        markEmitted() { return Promise.resolve(marked); },
        release() { return Promise.reject(new Error("release must not run")); },
        consume() { return Promise.reject(new Error("consume must not run")); },
      },
      fetchFns: {
        anthropic: async () => {
          emissions += 1;
          if (primary === "throw") throw new Error("socket failed");
          return { ok: false, status: 503, json: async () => ({}) };
        },
        openai: async () => {
          emissions += 1;
          throw new Error("second socket");
        },
      },
    });
    return { result, emissions };
  }

  try {
    for (const primary of ["http", "throw"]) {
      for (const registry of ["unavailable", "reject"]) {
        const label = `${primary}/${registry}`;
        const { result, emissions } = await run(primary, registry);
        assert.equal(emissions, 1, label);
        assert.equal(result.ok, false, label);
        assert.equal(result.errorCode, "reservation_blocked", label);
        assert.equal(result.attempts.length, 2, label);
        assert.equal(result.attempts[0].provider, "anthropic", label);
        assert.equal(result.attempts[0].cost.kind, "failed_maybe_billed", label);
        assert.equal(result.attempts[0].cost.networkRequestSent, true, label);
        assert.equal(result.attempts[1].provider, "openai", label);
        assert.equal(result.attempts[1].cost.kind, "refused", label);
        assert.equal(result.attempts[1].cost.networkRequestSent, false, label);
        assert.equal(result.cost.kind, "failed_maybe_billed", label);
        assert.equal(result.cost.networkRequestSent, true, label);
        assert.equal(result.cost.monetaryUsd, null, label);
        assert.notEqual(result.cost.kind, "refused", label);
      }
    }
  } finally {
    delete process.env.HQ_CALL_RESERVATION;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  }
});
