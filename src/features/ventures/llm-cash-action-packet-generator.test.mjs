#!/usr/bin/env node
// Tests for src/features/ventures/llm-cash-action-packet-generator.ts
//
// No real network calls — fetchFn is always a mock.
// Tests cover: fallback on no key, valid LLM output, invalid JSON, partially
// invalid packets, and governance lock invariants.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");

function makeJiti() {
  return createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
}

const generatorPath = path.join(__dirname, "llm-cash-action-packet-generator.ts");
const seedDataPath = path.join(__dirname, "agent-venture-workbench-data.ts");

// ---------------------------------------------------------------------------
// Build a valid raw LLM packet (as the LLM would return it)
// ---------------------------------------------------------------------------

function validRawPacket(overrides = {}) {
  return {
    ventureId: "suivia",
    targetBuyer: "Clinique Esthétique Montréal",
    buyerType: "smb",
    painHypothesis: "Clinic owners lose hours manually compiling patient data weekly.",
    offer: "Suivia Weekly Briefing — Starter Pack (3-month pilot)",
    pricePointCents: 150000,
    callToAction: "Send a cold email and ask for a 20-minute discovery call.",
    outreachDraft:
      "Hi {name}, I help aesthetic clinics in QC get structured patient insights every Monday. Would you be open to a 20-minute call to see if it fits?",
    expectedCashSignal: "email_reply",
    requiredEvidence: ["email_reply"],
    expectedCashImpactCents: 150000,
    expectedCostCents: 5000,
    ...overrides,
  };
}

// Build a mock fetch that returns the given raw packets array as Anthropic response
function makeLlmFetch(rawPackets) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify(rawPackets) }],
    }),
  });
}

function makeErrorFetch(status = 500) {
  return async () => ({
    ok: false,
    status,
    json: async () => ({}),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test("llm-cash-action-packet-generator", async (t) => {
  // Load seed data for use as fallbackItems
  const jiti = makeJiti();
  const seedMod = await jiti.import(seedDataPath);
  const fallbackItems = seedMod.AGENT_VENTURE_WORKBENCH_ITEMS;
  const createdAt = "2026-06-02T19:00:00.000Z";

  async function loadGenerator() {
    const j = makeJiti();
    return j.import(generatorPath);
  }

  await t.test("ANTHROPIC_API_KEY absent → fallback_seed, no throw", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFn: makeErrorFetch(500),
    });
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    assert.equal(result.source, "fallback_seed");
    assert.ok(Array.isArray(result.packets));
    assert.ok(result.packets.length > 0);
    assert.ok(typeof result.fallbackReason === "string");
  });

  await t.test("valid LLM JSON → source=anthropic, packets valid", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-llm";
    const mod = await loadGenerator();
    const rawPackets = [validRawPacket(), validRawPacket({ ventureId: "orya-hq" })];
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFn: makeLlmFetch(rawPackets),
    });
    assert.equal(result.source, "anthropic");
    assert.equal(result.packets.length, 2);
    assert.ok(typeof result.modelId === "string");
  });

  await t.test("all LLM packets invalid → fallback_seed", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-llm";
    const mod = await loadGenerator();
    // Missing required fields
    const badPackets = [
      { ventureId: "suivia", targetBuyer: "" },
      { notAPacket: true },
    ];
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFn: makeLlmFetch(badPackets),
    });
    assert.equal(result.source, "fallback_seed");
    assert.ok(result.packets.length > 0);
    assert.ok(typeof result.fallbackReason === "string");
    assert.ok((result.invalidPacketCount ?? 0) > 0);
  });

  await t.test("LLM returns non-array JSON → fallback_seed", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-llm";
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFn: makeLlmFetch({ error: "not an array" }),
    });
    assert.equal(result.source, "fallback_seed");
    assert.ok(result.packets.length > 0);
  });

  await t.test("provider error → fallback_seed", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-llm";
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFn: makeErrorFetch(503),
    });
    assert.equal(result.source, "fallback_seed");
    assert.ok(typeof result.fallbackReason === "string");
  });

  await t.test("packet missing targetBuyer → that packet rejected, others kept", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-llm";
    const mod = await loadGenerator();
    const rawPackets = [
      validRawPacket({ targetBuyer: "" }),        // invalid
      validRawPacket({ ventureId: "orya-hq" }),    // valid
    ];
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFn: makeLlmFetch(rawPackets),
    });
    assert.equal(result.source, "anthropic");
    assert.equal(result.packets.length, 1);
    assert.equal(result.invalidPacketCount, 1);
  });

  await t.test("requiresCeoApproval is always true on LLM packets", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-llm";
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFn: makeLlmFetch([validRawPacket()]),
    });
    assert.equal(result.source, "anthropic");
    for (const packet of result.packets) {
      assert.strictEqual(packet.requiresCeoApproval, true);
    }
  });

  await t.test("noExecutionAuthorized is always true on LLM packets", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-llm";
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFn: makeLlmFetch([validRawPacket()]),
    });
    assert.equal(result.source, "anthropic");
    for (const packet of result.packets) {
      assert.strictEqual(packet.noExecutionAuthorized, true);
    }
  });

  await t.test("max 5 packets returned even if LLM returns more", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-llm";
    const mod = await loadGenerator();
    const rawPackets = Array.from({ length: 8 }, (_, i) =>
      validRawPacket({ ventureId: `suivia`, targetBuyer: `Buyer ${i + 1} — Clinique test` }),
    );
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFn: makeLlmFetch(rawPackets),
    });
    assert.ok(result.packets.length <= 5);
  });

  await t.test("ORYA_VENTURES has expected venture IDs", async () => {
    const mod = await loadGenerator();
    const ids = mod.ORYA_VENTURES.map((v) => v.ventureId);
    assert.ok(ids.includes("suivia"), "suivia should be present");
    assert.ok(ids.includes("orya-hq"), "orya-hq should be present");
    assert.ok(!ids.includes("mcl"), "mcl should NOT be present by default");
  });

  await t.test("fallback packets also have requiresCeoApproval=true", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFn: makeErrorFetch(),
    });
    assert.equal(result.source, "fallback_seed");
    for (const packet of result.packets) {
      assert.strictEqual(packet.requiresCeoApproval, true);
      assert.strictEqual(packet.noExecutionAuthorized, true);
    }
  });
});
