#!/usr/bin/env node

// src/server/joris/governance-decision-continuity.test.mjs
//
// PR134 — unit tests for the pure governance-decision continuity formatter.
// Verifies the read side of the audit trail: a compact, read-only note that
// authorizes nothing.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("governance decision continuity formatter (PR134)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "governance-decision-continuity.ts"));
  const { formatGovernanceDecisionContinuityNote } = mod;

  const rec = (overrides = {}) => ({
    id: "govdec_1",
    workspaceId: "ws",
    workOrderId: "wo_venture_1",
    bundleId: "bundle_1",
    outcome: "approved_to_plan",
    sessionStatus: "approved_to_plan",
    reviewerId: "ceo",
    reviewerRole: "ceo",
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    decidedAt: "2026-05-30T12:00:00.000Z",
    createdAt: "2026-05-30T12:00:00.000Z",
    ...overrides,
  });

  await t.test("returns null with no decisions", () => {
    assert.equal(formatGovernanceDecisionContinuityNote([]), null);
    assert.equal(formatGovernanceDecisionContinuityNote(undefined), null);
  });

  await t.test("highlights the most recent decision with a FR label and date", () => {
    const note = formatGovernanceDecisionContinuityNote([rec()]);
    assert.ok(note);
    assert.ok(note.includes("Continuité gouvernance"));
    assert.ok(note.includes("1 décision(s)"));
    assert.ok(note.includes("approuvé pour planification"));
    assert.ok(note.includes("wo_venture_1"));
    assert.ok(note.includes("2026-05-30"));
  });

  await t.test("never authorizes execution — repeats the audit-only reminder", () => {
    const note = formatGovernanceDecisionContinuityNote([rec()]);
    assert.ok(note.includes("n'autorisent aucune exécution"));
  });

  await t.test("lists up to `limit` recent decisions, most-recent-first order preserved", () => {
    const decisions = [
      rec({ id: "d1", outcome: "rejected", workOrderId: "wo_3", decidedAt: "2026-05-30T15:00:00.000Z" }),
      rec({ id: "d2", outcome: "approved_to_plan", workOrderId: "wo_2", decidedAt: "2026-05-30T14:00:00.000Z" }),
      rec({ id: "d3", outcome: "blocked_execution_request", workOrderId: "wo_1", decidedAt: "2026-05-30T13:00:00.000Z" }),
      rec({ id: "d4", outcome: "more_info_requested", workOrderId: "wo_0", decidedAt: "2026-05-30T12:00:00.000Z" }),
    ];
    const note = formatGovernanceDecisionContinuityNote(decisions, 2);
    assert.ok(note.includes("4 décision(s)"));
    // Most-recent highlighted.
    assert.ok(note.includes("**rejeté**"));
    // Only 2 listed under "Décisions récentes".
    assert.ok(note.includes("wo_3"));
    assert.ok(note.includes("wo_2"));
    assert.ok(!note.includes("wo_1"));
    assert.ok(!note.includes("wo_0"));
  });

  await t.test("maps every outcome to a human label", () => {
    const outcomes = {
      approved_to_plan: "approuvé pour planification",
      changes_requested: "modifications demandées",
      rejected: "rejeté",
      more_info_requested: "informations demandées",
      blocked_execution_request: "demande d'exécution bloquée",
    };
    for (const [outcome, label] of Object.entries(outcomes)) {
      const note = formatGovernanceDecisionContinuityNote([rec({ outcome })]);
      assert.ok(note.includes(label), `expected label "${label}" for outcome "${outcome}"`);
    }
  });
});
