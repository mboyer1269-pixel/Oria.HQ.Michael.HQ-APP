#!/usr/bin/env node
// Tests for src/features/ventures/llm-cash-action-packet-generator.ts
//
// Covers provider auto-routing, OpenAI source, fallback paths, and governance
// lock invariants. No real network calls — fetchFns are always mocks.

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

const ANTHROPIC_KEY = "anthropic-test-key";
const OPENAI_KEY = "openai-test-key";

// ---------------------------------------------------------------------------
// Base valid raw packet (as the LLM would return)
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
      "Hi {name}, I help aesthetic clinics in QC get structured patient insights every Monday. Would you be open to a 20-minute call?",
    expectedCashSignal: "email_reply",
    requiredEvidence: ["email_reply"],
    expectedCashImpactCents: 150000,
    expectedCostCents: 5000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// fetch mock builders
// ---------------------------------------------------------------------------

function makeAnthropicFetch(rawPackets) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify(rawPackets) }],
    }),
  });
}

function makeOpenAiFetch(rawPackets) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(rawPackets) } }],
    }),
  });
}

function makeErrorFetch(status = 500) {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test("llm-cash-action-packet-generator", async (t) => {
  const jiti = makeJiti();
  const seedMod = await jiti.import(seedDataPath);
  const fallbackItems = seedMod.AGENT_VENTURE_WORKBENCH_ITEMS;
  const createdAt = "2026-06-02T20:00:00.000Z";

  async function loadGenerator() {
    return makeJiti().import(generatorPath);
  }

  // -------------------------------------------------------------------------
  // Anthropic path (unchanged behaviour)
  // -------------------------------------------------------------------------

  await t.test("ANTHROPIC_API_KEY absent, OPENAI_API_KEY absent → fallback_seed", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
    });
    assert.equal(result.source, "fallback_seed");
    assert.ok(result.packets.length > 0);
    assert.ok(typeof result.fallbackReason === "string");
  });

  await t.test("Anthropic returns valid JSON → source=anthropic", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    delete process.env.OPENAI_API_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFns: { anthropic: makeAnthropicFetch([validRawPacket()]) },
    });
    assert.equal(result.source, "anthropic");
    assert.ok(result.packets.length > 0);
  });

  // -------------------------------------------------------------------------
  // OpenAI path
  // -------------------------------------------------------------------------

  await t.test("explicit openai → source=openai", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      providerPreference: "openai",
      fetchFns: { openai: makeOpenAiFetch([validRawPacket()]) },
    });
    assert.equal(result.source, "openai");
    assert.ok(result.packets.length > 0);
  });

  await t.test("OpenAI packet has provider in agentId", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      providerPreference: "openai",
      fetchFns: { openai: makeOpenAiFetch([validRawPacket()]) },
    });
    assert.equal(result.source, "openai");
    for (const packet of result.packets) {
      assert.ok(packet.agentId.startsWith("openai:"), `agentId should start with openai: got ${packet.agentId}`);
    }
  });

  // -------------------------------------------------------------------------
  // Auto fallback: Anthropic → OpenAI
  // -------------------------------------------------------------------------

  await t.test("auto: Anthropic fails → falls back to OpenAI, source=openai", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFns: {
        anthropic: makeErrorFetch(503),
        openai: makeOpenAiFetch([validRawPacket()]),
      },
    });
    assert.equal(result.source, "openai");
    assert.equal(result.providerFallbackUsed, true);
    assert.ok(result.packets.length > 0);
  });

  await t.test("auto: both fail → fallback_seed with failureChain", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFns: {
        anthropic: makeErrorFetch(500),
        openai: makeErrorFetch(500),
      },
    });
    assert.equal(result.source, "fallback_seed");
    assert.ok(Array.isArray(result.failureChain) && result.failureChain.length >= 2);
    assert.ok(result.packets.length > 0);
  });

  // -------------------------------------------------------------------------
  // Validation / rejection
  // -------------------------------------------------------------------------

  await t.test("all LLM packets invalid → fallback_seed", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    delete process.env.OPENAI_API_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFns: {
        anthropic: makeAnthropicFetch([
          { ventureId: "suivia", targetBuyer: "" },
        ]),
      },
    });
    assert.equal(result.source, "fallback_seed");
    assert.ok((result.invalidPacketCount ?? 0) > 0);
  });

  await t.test("invalid OpenAI packet is rejected, valid one kept", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      providerPreference: "openai",
      fetchFns: {
        openai: makeOpenAiFetch([
          { ventureId: "orya-hq", targetBuyer: "" },   // invalid
          validRawPacket({ ventureId: "suivia" }),      // valid
        ]),
      },
    });
    assert.equal(result.source, "openai");
    assert.equal(result.packets.length, 1);
    assert.equal(result.invalidPacketCount, 1);
  });

  // -------------------------------------------------------------------------
  // Governance locks — always true regardless of provider
  // -------------------------------------------------------------------------

  await t.test("requiresCeoApproval=true on Anthropic packets", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    delete process.env.OPENAI_API_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      fetchFns: { anthropic: makeAnthropicFetch([validRawPacket()]) },
    });
    for (const p of result.packets) assert.strictEqual(p.requiresCeoApproval, true);
  });

  await t.test("noExecutionAuthorized=true on OpenAI packets", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      providerPreference: "openai",
      fetchFns: { openai: makeOpenAiFetch([validRawPacket()]) },
    });
    for (const p of result.packets) assert.strictEqual(p.noExecutionAuthorized, true);
  });

  await t.test("governance locks true on fallback_seed packets", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const mod = await loadGenerator();
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
    });
    assert.equal(result.source, "fallback_seed");
    for (const p of result.packets) {
      assert.strictEqual(p.requiresCeoApproval, true);
      assert.strictEqual(p.noExecutionAuthorized, true);
    }
  });

  // -------------------------------------------------------------------------
  // Other invariants
  // -------------------------------------------------------------------------

  await t.test("max 5 packets from OpenAI even if more returned", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const mod = await loadGenerator();
    const rawMany = Array.from({ length: 8 }, (_, i) =>
      validRawPacket({ targetBuyer: `Buyer ${i + 1} — Clinique test` }),
    );
    const result = await mod.generateLlmCashActionPacketsFromVentures({
      ventures: mod.ORYA_VENTURES,
      fallbackItems,
      createdAt,
      providerPreference: "openai",
      fetchFns: { openai: makeOpenAiFetch(rawMany) },
    });
    assert.ok(result.packets.length <= 5);
  });

  await t.test("ORYA_VENTURES has suivia and orya-hq, not mcl", async () => {
    const mod = await loadGenerator();
    const ids = mod.ORYA_VENTURES.map((v) => v.ventureId);
    assert.ok(ids.includes("suivia"));
    assert.ok(ids.includes("orya-hq"));
    assert.ok(!ids.includes("mcl"));
  });
});
