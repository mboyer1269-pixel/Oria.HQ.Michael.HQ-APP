#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Hermes prep plan (pure planner)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "hermes-prep-plan.ts"));
  const {
    computeHermesPrepPlan,
    computePreparedActionPriorityScore,
    priorityBucketForScore,
    preparedActionIdFor,
    isActivePreparedAction,
  } = mod;

  const cashMod = await jiti.import(path.join(__dirname, "cash-action-packet.ts"));
  const { buildCashActionPacket } = cashMod;
  const hermesMod = await jiti.import(path.join(__dirname, "hermes-outreach-plan.ts"));
  const { buildHermesOutreachPlanFromCashActionPacket } = hermesMod;
  const paMod = await jiti.import(path.join(__dirname, "prepared-action.ts"));
  const { buildPreparedAction } = paMod;

  const AT = "2026-06-02T00:00:00.000Z";

  function makePacket(overrides = {}) {
    return buildCashActionPacket({
      packetId: overrides.packetId ?? "packet-001",
      ventureId: overrides.ventureId ?? "venture-001",
      agentId: "agent-001",
      targetBuyer: overrides.targetBuyer ?? "Heads of RevOps at 20-100 person B2B SaaS companies",
      buyerType: "smb",
      painHypothesis: "They reconcile pipeline by hand every Friday and lose 3 hours to it.",
      offer: overrides.offer ?? "A done-for-you weekly pipeline reconciliation, delivered every Friday.",
      pricePointCents: 49_000,
      callToAction: "Reply 'pilot' to start a paid 2-week pilot this Friday.",
      outreachDraft: overrides.outreachDraft ?? "Hi {name}, saw your team reconciles pipeline manually — want a Friday report?",
      expectedCashSignal: "email_reply",
      requiredEvidence: ["email_reply"],
      expectedCashImpactCents: overrides.expectedCashImpactCents ?? 49_000,
      expectedCostCents: overrides.expectedCostCents ?? 7_000,
      createdAt: AT,
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

  function makeCandidate(overrides = {}) {
    const packet = overrides.packet ?? makePacket(overrides.packetOverrides ?? {});
    return {
      packet,
      council: overrides.council ?? makeCouncil(),
      hermesPlan: overrides.hermesPlan ?? buildHermesOutreachPlanFromCashActionPacket(packet),
    };
  }

  function existingFromCandidate(candidate, overrides = {}) {
    return buildPreparedAction({
      preparedActionId: overrides.preparedActionId ?? "existing-001",
      ventureId: candidate.packet.ventureId,
      cashActionPacketId: candidate.packet.packetId,
      packet: candidate.packet,
      council: candidate.council,
      hermesPlan: candidate.hermesPlan,
      priority: "high",
      priorityScore: 100,
      status: overrides.status ?? "ready_for_ceo_review",
      createdAt: "2026-06-01T00:00:00.000Z",
    });
  }

  // -------------------------------------------------------------------------
  // Group 1 — New entries
  // -------------------------------------------------------------------------
  await t.test("new entries", async (t) => {
    await t.test("an empty queue enqueues every candidate as new", () => {
      const result = computeHermesPrepPlan({
        candidates: [makeCandidate(), makeCandidate({ packetOverrides: { packetId: "packet-002", offer: "Another distinct offer for a different move." } })],
        existing: [],
        createdAt: AT,
      });
      assert.equal(result.summary.candidates, 2);
      assert.equal(result.summary.created, 2);
      assert.equal(result.summary.refreshed, 0);
      assert.equal(result.summary.deduped, 0);
      assert.equal(result.toEnqueue.length, 2);
      assert.ok(result.toEnqueue.every((e) => e.kind === "new"));
    });

    await t.test("new entries are ready_for_ceo_review and proposal-only", () => {
      const [entry] = computeHermesPrepPlan({ candidates: [makeCandidate()], existing: [], createdAt: AT }).toEnqueue;
      assert.equal(entry.action.status, "ready_for_ceo_review");
      assert.equal(entry.action.requiresCeoApproval, true);
      assert.equal(entry.action.noExecutionAuthorized, true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Dedup
  // -------------------------------------------------------------------------
  await t.test("dedup", async (t) => {
    await t.test("an identical active entry is deduped (skipped)", () => {
      const candidate = makeCandidate();
      const existing = existingFromCandidate(candidate);
      const result = computeHermesPrepPlan({ candidates: [candidate], existing: [existing], createdAt: AT });
      assert.equal(result.summary.deduped, 1);
      assert.equal(result.summary.created, 0);
      assert.equal(result.toEnqueue.length, 0);
    });

    await t.test("duplicate candidates within one batch are deduped", () => {
      const c = makeCandidate();
      const result = computeHermesPrepPlan({ candidates: [c, makeCandidate()], existing: [], createdAt: AT });
      assert.equal(result.summary.created, 1);
      assert.equal(result.summary.deduped, 1);
    });

    await t.test("a superseded entry does not block a new one", () => {
      const candidate = makeCandidate();
      const stale = existingFromCandidate(candidate, { status: "superseded" });
      const result = computeHermesPrepPlan({ candidates: [candidate], existing: [stale], createdAt: AT });
      assert.equal(result.summary.created, 1);
      assert.equal(result.summary.deduped, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — Refresh
  // -------------------------------------------------------------------------
  await t.test("refresh", async (t) => {
    await t.test("same move with changed content emits a superseding refresh", () => {
      const original = makeCandidate();
      const existing = existingFromCandidate(original, { preparedActionId: "old-1" });
      // Same dedup key (offer/targetBuyer/venture/channel) but a changed draft.
      const changed = makeCandidate({
        packet: makePacket({ outreachDraft: "Hi {name}, NEW improved draft for the Friday report pilot." }),
      });
      const result = computeHermesPrepPlan({ candidates: [changed], existing: [existing], createdAt: AT });
      assert.equal(result.summary.refreshed, 1);
      assert.equal(result.summary.created, 0);
      assert.equal(result.summary.deduped, 0);
      const [entry] = result.toEnqueue;
      assert.equal(entry.kind, "refresh");
      assert.equal(entry.supersedesId, "old-1");
      assert.equal(entry.action.supersedesId, "old-1");
      assert.equal(entry.action.contentHash, existing.contentHash, "same dedup key");
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — Prioritization
  // -------------------------------------------------------------------------
  await t.test("prioritization", async (t) => {
    await t.test("scores higher impact + readiness above lower", () => {
      const strong = makeCandidate({ packetOverrides: { packetId: "p-strong", offer: "Strong high-impact offer for RevOps leaders." , expectedCashImpactCents: 200_000 } });
      const weak = makeCandidate({
        packetOverrides: { packetId: "p-weak", offer: "Weaker lower-impact offer.", expectedCashImpactCents: 5_000 },
        council: makeCouncil({ readiness: "blocked_by_auditor" }),
      });
      const result = computeHermesPrepPlan({ candidates: [weak, strong], existing: [], createdAt: AT });
      assert.equal(result.toEnqueue[0].action.packet.packetId, "p-strong", "highest priority first");
      assert.ok(result.toEnqueue[0].action.priorityScore > result.toEnqueue[1].action.priorityScore);
    });

    await t.test("readiness lowers the score for the same packet", () => {
      const packet = makePacket();
      const ready = computePreparedActionPriorityScore(packet, makeCouncil({ readiness: "ready_for_ceo" }));
      const blocked = computePreparedActionPriorityScore(packet, makeCouncil({ readiness: "blocked_by_auditor" }));
      assert.ok(ready > blocked);
    });

    await t.test("buckets map at the defined boundaries", () => {
      assert.equal(priorityBucketForScore(300), "critical");
      assert.equal(priorityBucketForScore(299), "high");
      assert.equal(priorityBucketForScore(120), "high");
      assert.equal(priorityBucketForScore(119), "medium");
      assert.equal(priorityBucketForScore(40), "medium");
      assert.equal(priorityBucketForScore(39), "low");
      assert.equal(priorityBucketForScore(0), "low");
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Helpers & determinism
  // -------------------------------------------------------------------------
  await t.test("helpers & determinism", async (t) => {
    await t.test("isActivePreparedAction reflects status", () => {
      const c = makeCandidate();
      assert.equal(isActivePreparedAction(existingFromCandidate(c, { status: "ready_for_ceo_review" })), true);
      assert.equal(isActivePreparedAction(existingFromCandidate(c, { status: "superseded" })), false);
      assert.equal(isActivePreparedAction(existingFromCandidate(c, { status: "rejected" })), false);
    });

    await t.test("preparedActionIdFor is deterministic and packet+time derived", () => {
      assert.equal(preparedActionIdFor("packet-001", AT), preparedActionIdFor("packet-001", AT));
      assert.notEqual(preparedActionIdFor("packet-001", AT), preparedActionIdFor("packet-002", AT));
      assert.notEqual(preparedActionIdFor("packet-001", AT), preparedActionIdFor("packet-001", "2026-06-03T00:00:00.000Z"));
    });

    await t.test("plan output is deterministic", () => {
      const candidates = [makeCandidate()];
      assert.deepEqual(
        computeHermesPrepPlan({ candidates, existing: [], createdAt: AT }),
        computeHermesPrepPlan({ candidates, existing: [], createdAt: AT }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — Module boundary static source scan
  // -------------------------------------------------------------------------
  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "hermes-prep-plan.ts"), "utf-8");
    const imports = Array.from(sourceText.matchAll(/import[\s\S]*?;/g)).map((m) => m[0]).join("\n");

    await t.test("imports no DB/API/runtime/provider/email/AI/server modules", () => {
      assert.ok(!/supabase/i.test(imports), "must not import Supabase");
      assert.ok(!/(^|[/\\])db($|[/\\])/i.test(imports), "must not import db modules");
      assert.ok(!/runtime/i.test(imports), "must not import runtime modules");
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
