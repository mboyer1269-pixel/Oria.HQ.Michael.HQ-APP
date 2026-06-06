#!/usr/bin/env node
// Tests for daily-direction-generator.ts
// Exercises structured output validation, retry logic, and zero-state handling.
// Uses a mock fetchFn — no real API calls, no API keys needed.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const TODAY = "2026-06-06";

// Valid v4 UUID — Zod 4 validates UUID version bits strictly.
const FAKE_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function makeFakeIdeaRecord(id = FAKE_UUID) {
  return {
    id,
    workspaceId: "michael-hq",
    userId: FAKE_UUID,
    streamId: "michael-hq:ideas",
    type: "idea.captured",
    validFrom: null,
    validTo: null,
    recordedAt: `${TODAY}T07:00:00.000Z`,
    payload: {
      title: "Idée test",
      rawText: "Ceci est une idée de test.",
      capturedAt: `${TODAY}T07:00:00.000Z`,
    },
  };
}

/** Returns a mock fetch that replies with a valid DailyDirectionPayload JSON. */
function makeMockFetchValid() {
  const payload = {
    dateIso: TODAY,
    outcomes: [
      { text: "Outcome A", sourceEventIds: [FAKE_UUID] },
      { text: "Outcome B", sourceEventIds: [] },
      { text: "Outcome C", sourceEventIds: [] },
    ],
    cashAction: { text: "Appeler un client", sourceEventIds: [FAKE_UUID] },
    buildAction: { text: "Avancer ORIA", sourceEventIds: [] },
    decisionToMake: { text: "Décider du pricing", sourceEventIds: [FAKE_UUID] },
    thingToCut: { text: "Ignorer les notifications Slack", sourceEventIds: [] },
    generatorEventIds: [FAKE_UUID],
    isZeroState: false,
    zeroStateMessage: null,
    generatedAt: `${TODAY}T08:00:00.000Z`,
  };

  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify(payload) }],
      usage: { input_tokens: 100, output_tokens: 200 },
      model: "claude-haiku-4-5-20251001",
    }),
    text: async () => JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
  });
}

/** Returns a mock fetch that replies with invalid JSON (missing required fields). */
function makeMockFetchInvalidThenValid() {
  let callCount = 0;
  const validPayload = {
    dateIso: TODAY,
    outcomes: [
      { text: "Outcome A", sourceEventIds: [] },
      { text: "Outcome B", sourceEventIds: [] },
      { text: "Outcome C", sourceEventIds: [] },
    ],
    cashAction: { text: "Cash action", sourceEventIds: [] },
    buildAction: { text: "Build action", sourceEventIds: [] },
    decisionToMake: { text: "Decision", sourceEventIds: [] },
    thingToCut: { text: "Cut this", sourceEventIds: [] },
    generatorEventIds: [],
    isZeroState: false,
    zeroStateMessage: null,
    generatedAt: `${TODAY}T08:00:00.000Z`,
  };

  return async () => {
    callCount++;
    const responseJson =
      callCount === 1
        ? { outcomes: [] } // invalid — missing required fields
        : validPayload;

    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify(responseJson) }],
        usage: { input_tokens: 100, output_tokens: 200 },
        model: "claude-haiku-4-5-20251001",
      }),
      text: async () => "",
    };
  };
}

/** Returns a mock fetch that always replies with invalid JSON. */
function makeMockFetchAlwaysInvalid() {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify({ invalid: true }) }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: "claude-haiku-4-5-20251001",
    }),
    text: async () => "",
  });
}

/** Returns a mock fetch that simulates a network/API failure. */
function makeMockFetchFailure() {
  return async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: "server error" }),
    text: async () => "",
  });
}

test("daily-direction-generator", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { generateDailyDirection } = await jiti.import(
    path.join(__dirname, "daily-direction-generator.ts"),
  );

  // The anthropic + openai clients check for API keys before using the fetchFn.
  // Set fake keys so the key-guard passes; the mock fetch handles the response.
  const savedAnthropic = process.env.ANTHROPIC_API_KEY;
  const savedOpenAI = process.env.OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-fake-key-unit-tests";
  process.env.OPENAI_API_KEY = "test-fake-key-unit-tests";

  t.after(() => {
    if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    else delete process.env.ANTHROPIC_API_KEY;
    if (savedOpenAI !== undefined) process.env.OPENAI_API_KEY = savedOpenAI;
    else delete process.env.OPENAI_API_KEY;
  });

  // -------------------------------------------------------------------------
  // Happy path — valid LLM response
  // -------------------------------------------------------------------------

  await t.test("returns ok:true with valid payload on first attempt", async () => {
    const result = await generateDailyDirection({
      ideaEvents: [makeFakeIdeaRecord()],
      dateIso: TODAY,
      fetchFn: makeMockFetchValid(),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.usedRetry, false);
    assert.equal(result.payload.dateIso, TODAY);
    assert.equal(result.payload.outcomes.length, 3);
    assert.equal(result.payload.isZeroState, false);
    assert.equal(result.payload.zeroStateMessage, null);
  });

  // -------------------------------------------------------------------------
  // Retry — invalid first, valid on retry
  // -------------------------------------------------------------------------

  await t.test("retries once and succeeds when first response is invalid", async () => {
    const result = await generateDailyDirection({
      ideaEvents: [makeFakeIdeaRecord()],
      dateIso: TODAY,
      fetchFn: makeMockFetchInvalidThenValid(),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.usedRetry, true);
  });

  // -------------------------------------------------------------------------
  // Failure — always invalid
  // -------------------------------------------------------------------------

  await t.test("returns ok:false after two invalid responses", async () => {
    const result = await generateDailyDirection({
      ideaEvents: [makeFakeIdeaRecord()],
      dateIso: TODAY,
      fetchFn: makeMockFetchAlwaysInvalid(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errorCode, "validation_failed_after_retry");
  });

  // -------------------------------------------------------------------------
  // sourceEventIds traceability
  // -------------------------------------------------------------------------

  await t.test("returned payload includes sourceEventIds that cite real event IDs", async () => {
    const result = await generateDailyDirection({
      ideaEvents: [makeFakeIdeaRecord(FAKE_UUID)],
      dateIso: TODAY,
      fetchFn: makeMockFetchValid(),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    // cashAction cites the real event ID in our mock
    assert.deepEqual(result.payload.cashAction.sourceEventIds, [FAKE_UUID]);
    assert.deepEqual(result.payload.generatorEventIds, [FAKE_UUID]);
  });

  // -------------------------------------------------------------------------
  // Zero-state — no events
  // -------------------------------------------------------------------------

  await t.test("handles zero-state: empty ideaEvents produces valid direction", async () => {
    // Build a valid zero-state payload for the mock to return
    const zeroPayload = {
      dateIso: TODAY,
      outcomes: [
        { text: "Capture ta première idée", sourceEventIds: [] },
        { text: "Explore une idée de venture", sourceEventIds: [] },
        { text: "Identifie un problème réel", sourceEventIds: [] },
      ],
      cashAction: { text: "Capture ta première idée", sourceEventIds: [] },
      buildAction: { text: "Configure ORIA HQ", sourceEventIds: [] },
      decisionToMake: { text: "Quelle idée prioriser ?", sourceEventIds: [] },
      thingToCut: { text: "Ne pas improviser sans matière réelle", sourceEventIds: [] },
      generatorEventIds: [],
      isZeroState: true,
      zeroStateMessage: "Capture ta première idée pour démarrer.",
      generatedAt: `${TODAY}T08:00:00.000Z`,
    };

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify(zeroPayload) }],
        usage: { input_tokens: 50, output_tokens: 100 },
        model: "claude-haiku-4-5-20251001",
      }),
      text: async () => "",
    });

    const result = await generateDailyDirection({
      ideaEvents: [],
      dateIso: TODAY,
      fetchFn: mockFetch,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.payload.isZeroState, true);
    assert.ok(typeof result.payload.zeroStateMessage === "string");
    assert.equal(result.payload.generatorEventIds.length, 0);
  });

  // -------------------------------------------------------------------------
  // LLM network failure
  // -------------------------------------------------------------------------

  await t.test("returns ok:false with llm_unavailable when provider fails", async () => {
    const result = await generateDailyDirection({
      ideaEvents: [makeFakeIdeaRecord()],
      dateIso: TODAY,
      fetchFn: makeMockFetchFailure(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errorCode, "llm_unavailable");
  });
});
