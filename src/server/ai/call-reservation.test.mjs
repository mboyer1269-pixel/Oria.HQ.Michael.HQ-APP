#!/usr/bin/env node
// USD-cent reservation contract. Injected gate and injected fetch only.
// The gate below is not production. The SQL race is proofs/prove-call-reservation-real-db.mjs.
// No provider network.

import assert from "node:assert/strict";
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

function standardQuotes() {
  return new Map([
    [`anthropic|${ANTHROPIC_JSON_DEFAULT_MODEL}`, { cents: 80, coversMaxTokens: ANTHROPIC_JSON_DEFAULT_MAX_TOKENS, reliable: true }],
    [`openai|${OPENAI_JSON_DEFAULT_MODEL}`, { cents: 40, coversMaxTokens: OPENAI_JSON_DEFAULT_MAX_TOKENS, reliable: true }],
    [`anthropic|${HAIKU}`, { cents: 80, coversMaxTokens: 2048, reliable: true }],
    [`openai|${MINI}`, { cents: 40, coversMaxTokens: 2048, reliable: true }],
    [`anthropic|${SONNET}`, { cents: 200, coversMaxTokens: 2048, reliable: true }],
    ["openai|gpt-4o", { cents: 200, coversMaxTokens: 2048, reliable: false }],
  ]);
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
      if (!quote || quote.reliable !== true || quote.cents <= 0 || quote.coversMaxTokens < input.maxTokens) {
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
