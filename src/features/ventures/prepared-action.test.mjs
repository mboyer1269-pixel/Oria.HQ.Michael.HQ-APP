#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("PreparedAction model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "prepared-action.ts"));
  const {
    PREPARED_ACTION_PRIORITIES,
    PREPARED_ACTION_STATUSES,
    PREPARED_ACTION_READINESS_VALUES,
    computePreparedActionContentHash,
    preparedActionContentHashFor,
    validatePreparedAction,
    isPreparedActionProposalOnly,
    buildPreparedAction,
  } = mod;

  const cashMod = await jiti.import(path.join(__dirname, "cash-action-packet.ts"));
  const { buildCashActionPacket } = cashMod;
  const hermesMod = await jiti.import(path.join(__dirname, "hermes-outreach-plan.ts"));
  const { buildHermesOutreachPlanFromCashActionPacket } = hermesMod;

  function makePacket(overrides = {}) {
    return buildCashActionPacket({
      packetId: "packet-001",
      ventureId: "venture-001",
      agentId: "agent-001",
      targetBuyer: "Heads of RevOps at 20-100 person B2B SaaS companies",
      buyerType: "smb",
      painHypothesis: "They reconcile pipeline by hand every Friday and lose 3 hours to it.",
      offer: "A done-for-you weekly pipeline reconciliation, delivered every Friday.",
      pricePointCents: 49_000,
      callToAction: "Reply 'pilot' to start a paid 2-week pilot this Friday.",
      outreachDraft: "Hi {name}, saw your team reconciles pipeline manually — want a Friday report?",
      expectedCashSignal: "email_reply",
      requiredEvidence: ["email_reply"],
      expectedCashImpactCents: 49_000,
      expectedCostCents: 7_000,
      createdAt: "2026-06-02T00:00:00.000Z",
      ...overrides,
    });
  }

  function makeCouncil(overrides = {}) {
    return {
      readiness: "ready_for_ceo",
      verdictDecision: "needs_ceo_decision",
      recommendedManualAction: "CEO manually adapts and sends the outreach draft.",
      ...overrides,
    };
  }

  function makeInput(overrides = {}) {
    const packet = overrides.packet ?? makePacket();
    const hermesPlan = overrides.hermesPlan ?? buildHermesOutreachPlanFromCashActionPacket(packet);
    return {
      preparedActionId: "packet-001_prepared",
      ventureId: packet.ventureId,
      cashActionPacketId: packet.packetId,
      packet,
      council: makeCouncil(),
      hermesPlan,
      priority: "high",
      priorityScore: 42,
      status: "ready_for_ceo_review",
      createdAt: "2026-06-02T00:00:00.000Z",
      ...overrides,
    };
  }

  function makeAction(overrides = {}) {
    return buildPreparedAction(makeInput(overrides));
  }

  // -------------------------------------------------------------------------
  // Group 1 — Valid prepared action
  // -------------------------------------------------------------------------
  await t.test("valid prepared action", async (t) => {
    await t.test("builds a valid action", () => {
      const result = validatePreparedAction(makeAction());
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    await t.test("exposes priorities, statuses, readiness values", () => {
      assert.deepEqual([...PREPARED_ACTION_PRIORITIES], ["critical", "high", "medium", "low"]);
      assert.deepEqual([...PREPARED_ACTION_STATUSES], [
        "prepared",
        "ready_for_ceo_review",
        "approved_for_manual_send",
        "rejected",
        "superseded",
      ]);
      assert.ok(PREPARED_ACTION_READINESS_VALUES.includes("ready_for_ceo"));
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Content hash / dedup
  // -------------------------------------------------------------------------
  await t.test("content hash", async (t) => {
    await t.test("is deterministic for the same inputs", () => {
      const h1 = computePreparedActionContentHash("v", "offer", "buyer", "email");
      const h2 = computePreparedActionContentHash("v", "offer", "buyer", "email");
      assert.equal(h1, h2);
    });

    await t.test("changes when a defining field changes", () => {
      const base = computePreparedActionContentHash("v", "offer", "buyer", "email");
      assert.notEqual(base, computePreparedActionContentHash("v", "offer", "buyer", "manual"));
      assert.notEqual(base, computePreparedActionContentHash("v2", "offer", "buyer", "email"));
    });

    await t.test("builder derives contentHash from packet + plan", () => {
      const packet = makePacket();
      const plan = buildHermesOutreachPlanFromCashActionPacket(packet);
      const action = makeAction({ packet, hermesPlan: plan });
      assert.equal(action.contentHash, preparedActionContentHashFor(packet, plan));
    });

    await t.test("two actions for the same move share a content hash (dedup key)", () => {
      const a = makeAction();
      const b = makeAction({ preparedActionId: "packet-001_prepared_refresh" });
      assert.equal(a.contentHash, b.contentHash);
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — Consistency & required fields
  // -------------------------------------------------------------------------
  await t.test("consistency & required fields", async (t) => {
    await t.test("rejects packet/cashActionPacketId mismatch", () => {
      const result = validatePreparedAction(makeAction({ cashActionPacketId: "other" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("packetId")));
    });

    await t.test("rejects ventureId mismatch with packet", () => {
      const result = validatePreparedAction(makeAction({ ventureId: "other-venture" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("ventureId")));
    });

    await t.test("rejects unknown priority", () => {
      const result = validatePreparedAction(makeAction({ priority: "urgent" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("priority")));
    });

    await t.test("rejects negative priorityScore", () => {
      const result = validatePreparedAction(makeAction({ priorityScore: -1 }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("priorityScore")));
    });

    await t.test("rejects unknown status", () => {
      const result = validatePreparedAction(makeAction({ status: "sent" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("status")));
    });

    await t.test("rejects unknown council readiness", () => {
      const result = validatePreparedAction(makeAction({ council: makeCouncil({ readiness: "yolo" }) }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("readiness")));
    });

    await t.test("propagates an invalid embedded packet", () => {
      const action = makeAction();
      const broken = { ...action, packet: { ...action.packet, offer: "" } };
      const result = validatePreparedAction(broken);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.startsWith("packet:")));
    });

    await t.test("propagates an invalid embedded hermes plan", () => {
      const action = makeAction();
      const broken = { ...action, hermesPlan: { ...action.hermesPlan, cta: "" } };
      const result = validatePreparedAction(broken);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.startsWith("hermesPlan:")));
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — Governance: proposal only
  // -------------------------------------------------------------------------
  await t.test("governance: proposal only", async (t) => {
    await t.test("builder locks the three governance flags to true", () => {
      const a = makeAction();
      assert.equal(a.requiresCeoApproval, true);
      assert.equal(a.requiresManualSend, true);
      assert.equal(a.noExecutionAuthorized, true);
    });

    await t.test("isPreparedActionProposalOnly is true for a built action", () => {
      assert.equal(isPreparedActionProposalOnly(makeAction()), true);
    });

    await t.test("rejects requiresManualSend = false", () => {
      const result = validatePreparedAction({ ...makeAction(), requiresManualSend: false });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("requiresManualSend")));
    });

    await t.test("rejects noExecutionAuthorized = false", () => {
      const result = validatePreparedAction({ ...makeAction(), noExecutionAuthorized: false });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("noExecutionAuthorized")));
    });

    await t.test("exposes no send / execute / dispatch path (data only)", () => {
      const a = makeAction();
      assert.equal("send" in a, false);
      assert.equal("execute" in a, false);
      assert.equal("dispatch" in a, false);
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Determinism & purity
  // -------------------------------------------------------------------------
  await t.test("determinism & purity", async (t) => {
    await t.test("build output is deterministic", () => {
      assert.deepEqual(makeAction(), makeAction());
    });

    await t.test("builder deep-copies nested packet (no shared reference)", () => {
      const packet = makePacket();
      const action = makeAction({ packet });
      action.packet.offer = "MUTATED";
      assert.notEqual(packet.offer, "MUTATED");
    });

    await t.test("omits supersedesId when absent, keeps it when present", () => {
      assert.equal("supersedesId" in makeAction(), false);
      const chained = makeAction({ supersedesId: "packet-001_prepared_old" });
      assert.equal(chained.supersedesId, "packet-001_prepared_old");
    });

    await t.test("validation does not mutate input", () => {
      const a = makeAction();
      const snapshot = JSON.stringify(a);
      validatePreparedAction(a);
      assert.equal(JSON.stringify(a), snapshot);
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — Module boundary static source scan
  // -------------------------------------------------------------------------
  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "prepared-action.ts"), "utf-8");
    const imports = Array.from(sourceText.matchAll(/import[\s\S]*?;/g))
      .map((m) => m[0])
      .join("\n");

    await t.test("imports no DB/API/runtime/provider/email/AI/server modules", () => {
      assert.ok(!/supabase/i.test(imports), "must not import Supabase");
      assert.ok(!/(^|[/\\])db($|[/\\])/i.test(imports), "must not import db modules");
      assert.ok(!/(^|[/\\])api($|[/\\])/i.test(imports), "must not import API modules");
      assert.ok(!/runtime/i.test(imports), "must not import runtime modules");
      assert.ok(!/ledger/i.test(imports), "must not import Action Ledger modules");
      assert.ok(!/provider/i.test(imports), "must not import provider modules");
      assert.ok(!/resend|nodemailer|smtp|gmail/i.test(imports), "must not import email modules");
      assert.ok(!/(openai|anthropic|llm)/i.test(imports), "must not import AI/LLM modules");
      assert.ok(!/@\/server|src\/server|\.\.\/server/.test(imports), "must not import server modules");
    });

    await t.test("exports no save, persist, send, execute, or dispatch paths", () => {
      assert.ok(!sourceText.match(/\bexport\s+function\s+save/i), "no save export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+persist/i), "no persist export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+send/i), "no send export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+execute/i), "no execute export");
      assert.ok(!sourceText.match(/\bexport\s+function\s+dispatch/i), "no dispatch export");
    });
  });
});
