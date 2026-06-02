#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("HermesOutreachPlan model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "hermes-outreach-plan.ts"));
  const {
    HERMES_OUTREACH_CHANNELS,
    HERMES_PLAN_APPROVAL_STATUSES,
    CHANNELS_REQUIRING_COMPLIANCE_NOTES,
    MANUAL_PROSPECT_SELECTION_REQUIRED,
    channelRequiresComplianceNotes,
    validateHermesOutreachPlan,
    hermesPlanRequiresCeoApproval,
    hermesPlanCanBeManuallySent,
    buildHermesOutreachPlan,
    buildHermesOutreachPlanFromCashActionPacket,
  } = mod;

  const cashMod = await jiti.import(path.join(__dirname, "cash-action-packet.ts"));
  const { buildCashActionPacket } = cashMod;

  function makeCashPacket(overrides = {}) {
    return buildCashActionPacket({
      packetId: "packet-001",
      ventureId: "venture-001",
      agentId: "agent-001",
      targetBuyer: "Heads of RevOps at 20-100 person B2B SaaS companies",
      buyerType: "smb",
      painHypothesis:
        "They reconcile pipeline by hand every Friday and lose 3 hours to it.",
      offer: "A done-for-you weekly pipeline reconciliation, delivered every Friday.",
      pricePointCents: 49_000,
      callToAction: "Reply 'pilot' to start a paid 2-week pilot this Friday.",
      outreachDraft:
        "Hi {name}, saw your team reconciles pipeline manually — want a done-for-you Friday report?",
      expectedCashSignal: "email_reply",
      requiredEvidence: ["email_reply"],
      expectedCashImpactCents: 49_000,
      expectedCostCents: 7_000,
      createdAt: "2026-06-02T00:00:00.000Z",
      ...overrides,
    });
  }

  // Build a plan directly (bypassing the packet transform) for targeted checks.
  function makePlanInput(overrides = {}) {
    return {
      planId: "plan-001",
      cashActionPacketId: "packet-001",
      ventureId: "venture-001",
      channel: "manual",
      senderRecommendation: "Send manually from the CEO's own verified identity.",
      prospectProfile: "Heads of RevOps at 20-100 person B2B SaaS companies (smb)",
      prospectSelectionCriteria:
        "manual prospect selection required: hand-pick real prospects.",
      personalizationBasis:
        "They reconcile pipeline by hand every Friday and lose 3 hours to it.",
      messageDraft:
        "Hi {name}, saw your team reconciles pipeline manually — want a done-for-you Friday report?",
      cta: "Reply 'pilot' to start a paid 2-week pilot.",
      expectedSignal: "email_reply",
      requiredEvidence: ["email_reply"],
      complianceNotes: "Respect platform terms and prior opt-outs.",
      riskNotes: "Prepared only. Verify the prospect is real before sending.",
      manualSendInstructions: "Copy the draft, personalize, and send it yourself.",
      approvalStatus: "ready_for_ceo_approval",
      createdAt: "2026-06-02T00:00:00.000Z",
      ...overrides,
    };
  }

  function makePlan(overrides = {}) {
    return buildHermesOutreachPlan(makePlanInput(overrides));
  }

  // -------------------------------------------------------------------------
  // Group 1 — Valid plan from a CashActionPacket
  // -------------------------------------------------------------------------
  await t.test("valid plan from CashActionPacket", async (t) => {
    await t.test("builds a valid plan from a packet", () => {
      const plan = buildHermesOutreachPlanFromCashActionPacket(makeCashPacket());
      const result = validateHermesOutreachPlan(plan);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    await t.test("carries identity from the packet", () => {
      const plan = buildHermesOutreachPlanFromCashActionPacket(makeCashPacket());
      assert.equal(plan.cashActionPacketId, "packet-001");
      assert.equal(plan.ventureId, "venture-001");
      assert.equal(plan.expectedSignal, "email_reply");
    });

    await t.test("email signal maps to the email channel by default", () => {
      const plan = buildHermesOutreachPlanFromCashActionPacket(makeCashPacket());
      assert.equal(plan.channel, "email");
    });

    await t.test("exposes the six outreach channels", () => {
      assert.deepEqual([...HERMES_OUTREACH_CHANNELS], [
        "email",
        "x_dm",
        "linkedin",
        "indie_hackers",
        "reddit",
        "manual",
      ]);
    });

    await t.test("exposes the four approval statuses", () => {
      assert.deepEqual([...HERMES_PLAN_APPROVAL_STATUSES], [
        "draft",
        "ready_for_ceo_approval",
        "approved_for_manual_send",
        "rejected",
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Compliance rules
  // -------------------------------------------------------------------------
  await t.test("compliance rules", async (t) => {
    await t.test("email channel requires compliance notes", () => {
      assert.equal(channelRequiresComplianceNotes("email"), true);
      assert.ok(CHANNELS_REQUIRING_COMPLIANCE_NOTES.includes("email"));
      const plan = makePlan({ channel: "email", complianceNotes: "   " });
      const result = validateHermesOutreachPlan(plan);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("complianceNotes")));
    });

    await t.test("email plan from packet has default compliance notes and is valid", () => {
      const plan = buildHermesOutreachPlanFromCashActionPacket(makeCashPacket());
      assert.equal(plan.channel, "email");
      assert.ok(plan.complianceNotes.trim().length > 0);
      assert.equal(validateHermesOutreachPlan(plan).valid, true);
    });

    await t.test("non-email channel does not require compliance notes", () => {
      assert.equal(channelRequiresComplianceNotes("manual"), false);
      const plan = makePlan({ channel: "manual", complianceNotes: "" });
      assert.equal(validateHermesOutreachPlan(plan).valid, true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — Manual prospect selection (no fabricated prospect)
  // -------------------------------------------------------------------------
  await t.test("manual prospect selection", async (t) => {
    await t.test("manual channel works without a fabricated prospect", () => {
      const plan = buildHermesOutreachPlanFromCashActionPacket(makeCashPacket(), {
        channel: "manual",
      });
      assert.equal(plan.channel, "manual");
      assert.equal(validateHermesOutreachPlan(plan).valid, true);
    });

    await t.test("absent prospect => 'manual prospect selection required'", () => {
      const plan = buildHermesOutreachPlanFromCashActionPacket(makeCashPacket());
      assert.ok(
        plan.prospectSelectionCriteria.includes(MANUAL_PROSPECT_SELECTION_REQUIRED),
      );
    });

    await t.test("does not invent a real prospect email address", () => {
      const plan = buildHermesOutreachPlanFromCashActionPacket(makeCashPacket());
      const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
      assert.equal(emailPattern.test(plan.prospectProfile), false);
      assert.equal(emailPattern.test(plan.prospectSelectionCriteria), false);
    });

    await t.test("rejects a fabricated email in prospect targeting fields", () => {
      const plan = makePlan({ prospectProfile: "Email jane.doe@acme.com directly" });
      const result = validateHermesOutreachPlan(plan);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("prospectProfile")));
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — Required fields
  // -------------------------------------------------------------------------
  await t.test("required fields", async (t) => {
    await t.test("requiredEvidence cannot be empty", () => {
      const result = validateHermesOutreachPlan(makePlan({ requiredEvidence: [] }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("requiredEvidence")));
    });

    await t.test("rejects an unknown evidence kind", () => {
      const result = validateHermesOutreachPlan(
        makePlan({ requiredEvidence: ["telepathy"] }),
      );
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("requiredEvidence")));
    });

    await t.test("cta is required", () => {
      const result = validateHermesOutreachPlan(makePlan({ cta: "   " }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("cta")));
    });

    await t.test("messageDraft is required", () => {
      const result = validateHermesOutreachPlan(makePlan({ messageDraft: "" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("messageDraft")));
    });

    await t.test("expectedSignal must be a known cash signal type", () => {
      const result = validateHermesOutreachPlan(makePlan({ expectedSignal: "telegram" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("expectedSignal")));
    });

    await t.test("channel must be a known outreach channel", () => {
      const result = validateHermesOutreachPlan(makePlan({ channel: "carrier_pigeon" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("channel")));
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Governance: prepare only, never auto-send
  // -------------------------------------------------------------------------
  await t.test("governance: prepare only, never auto-send", async (t) => {
    await t.test("builder locks the three governance flags to true", () => {
      const plan = makePlan();
      assert.equal(plan.requiresCeoApproval, true);
      assert.equal(plan.requiresManualSend, true);
      assert.equal(plan.noExecutionAuthorized, true);
    });

    await t.test("rejects requiresManualSend = false", () => {
      const plan = { ...makePlan(), requiresManualSend: false };
      const result = validateHermesOutreachPlan(plan);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("requiresManualSend")));
    });

    await t.test("rejects noExecutionAuthorized = false", () => {
      const plan = { ...makePlan(), noExecutionAuthorized: false };
      const result = validateHermesOutreachPlan(plan);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("noExecutionAuthorized")));
    });

    await t.test("rejects requiresCeoApproval = false", () => {
      const plan = { ...makePlan(), requiresCeoApproval: false };
      const result = validateHermesOutreachPlan(plan);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("requiresCeoApproval")));
    });

    await t.test("hermesPlanRequiresCeoApproval is always true for a built plan", () => {
      assert.equal(hermesPlanRequiresCeoApproval(makePlan()), true);
    });

    await t.test("blocks auto-send: cannot be sent before CEO approval", () => {
      const plan = makePlan({ approvalStatus: "ready_for_ceo_approval" });
      assert.equal(hermesPlanCanBeManuallySent(plan), false);
    });

    await t.test("only an approved status unlocks manual send", () => {
      const plan = makePlan({ approvalStatus: "approved_for_manual_send" });
      assert.equal(hermesPlanCanBeManuallySent(plan), true);
    });

    await t.test("a tampered no-execution flag never unlocks manual send", () => {
      const plan = {
        ...makePlan({ approvalStatus: "approved_for_manual_send" }),
        noExecutionAuthorized: false,
      };
      assert.equal(hermesPlanCanBeManuallySent(plan), false);
    });

    await t.test("exposes no send / execute / dispatch path (data only)", () => {
      const plan = makePlan();
      assert.equal("send" in plan, false);
      assert.equal("execute" in plan, false);
      assert.equal("dispatch" in plan, false);
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — Determinism & purity
  // -------------------------------------------------------------------------
  await t.test("determinism & purity", async (t) => {
    await t.test("packet transform is deterministic", () => {
      const packet = makeCashPacket();
      assert.deepEqual(
        buildHermesOutreachPlanFromCashActionPacket(packet),
        buildHermesOutreachPlanFromCashActionPacket(packet),
      );
    });

    await t.test("derives a deterministic planId and createdAt from the packet", () => {
      const plan = buildHermesOutreachPlanFromCashActionPacket(makeCashPacket());
      assert.equal(plan.planId, "packet-001_hermes_outreach_plan");
      assert.equal(plan.createdAt, "2026-06-02T00:00:00.000Z");
    });

    await t.test("builder copies requiredEvidence (no shared reference)", () => {
      const evidence = ["email_reply"];
      const plan = makePlan({ requiredEvidence: evidence });
      plan.requiredEvidence.push("stripe_charge");
      assert.equal(evidence.includes("stripe_charge"), false);
    });

    await t.test("validation does not mutate input", () => {
      const plan = makePlan();
      const snapshot = JSON.stringify(plan);
      validateHermesOutreachPlan(plan);
      assert.equal(JSON.stringify(plan), snapshot);
    });

    await t.test("omits ventureId when the packet has none", () => {
      const plan = buildHermesOutreachPlanFromCashActionPacket(
        makeCashPacket({ ventureId: "venture-xyz" }),
      );
      assert.equal(plan.ventureId, "venture-xyz");
    });
  });

  // -------------------------------------------------------------------------
  // Group 7 — Module boundary static source scan
  // -------------------------------------------------------------------------
  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(
      path.join(__dirname, "hermes-outreach-plan.ts"),
      "utf-8",
    );
    const imports = Array.from(sourceText.matchAll(/import[\s\S]*?;/g))
      .map((m) => m[0])
      .join("\n");

    await t.test("imports no DB/API/runtime/provider/email/AI modules", () => {
      assert.ok(!/supabase/i.test(imports), "must not import Supabase");
      assert.ok(!/(^|[/\\])db($|[/\\])/i.test(imports), "must not import db modules");
      assert.ok(!/(^|[/\\])api($|[/\\])/i.test(imports), "must not import API modules");
      assert.ok(!/runtime/i.test(imports), "must not import runtime modules");
      assert.ok(!/ledger/i.test(imports), "must not import Action Ledger modules");
      assert.ok(!/provider/i.test(imports), "must not import provider modules");
      assert.ok(!/resend|nodemailer|smtp|gmail/i.test(imports), "must not import email modules");
      assert.ok(!/(openai|anthropic|llm)/i.test(imports), "must not import AI/LLM modules");
      assert.ok(
        !/@\/server|src\/server|\.\.\/server/.test(imports),
        "must not import server modules",
      );
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
