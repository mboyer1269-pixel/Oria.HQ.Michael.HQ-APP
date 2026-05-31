#!/usr/bin/env node

// src/server/joris/governance-audit-report.test.mjs
//
// PR A (ROI tier 1) — pure unit tests for the governance audit report builder
// and CSV export. No I/O; records are passed in directly.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("governance audit report (PR A)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "governance-audit-report.ts"));
  const { buildGovernanceAuditReport, formatGovernanceAuditReportCsv } = mod;

  const rec = (overrides = {}) => ({
    id: "govdec_1",
    workspaceId: "ws1",
    workOrderId: "wo_1",
    bundleId: "b1",
    outcome: "approved_to_plan",
    sessionStatus: "approved_to_plan",
    reviewerId: "michael",
    reviewerRole: "ceo",
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    decidedAt: "2026-05-30T12:00:00.000Z",
    createdAt: "2026-05-30T12:00:00.000Z",
    ...overrides,
  });

  await t.test("filters to the requested workspace", () => {
    const report = buildGovernanceAuditReport({
      workspaceId: "ws1",
      decisions: [rec({ id: "a", workspaceId: "ws1" }), rec({ id: "b", workspaceId: "ws2" })],
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    assert.equal(report.totalDecisions, 1);
    assert.equal(report.decisions[0].id, "a");
    assert.equal(report.humanOnTheLoop, true);
    assert.equal(report.noExecutionAuthorized, true);
  });

  await t.test("sorts most-recent first (decidedAt desc, id desc tiebreak)", () => {
    const report = buildGovernanceAuditReport({
      workspaceId: "ws1",
      decisions: [
        rec({ id: "old", decidedAt: "2026-05-29T10:00:00.000Z" }),
        rec({ id: "new", decidedAt: "2026-05-30T10:00:00.000Z" }),
        rec({ id: "zzz", decidedAt: "2026-05-30T10:00:00.000Z" }),
      ],
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    assert.deepEqual(report.decisions.map((r) => r.id), ["zzz", "new", "old"]);
  });

  await t.test("filters by period (inclusive bounds on decidedAt)", () => {
    const decisions = [
      rec({ id: "before", decidedAt: "2026-05-01T00:00:00.000Z" }),
      rec({ id: "inside", decidedAt: "2026-05-15T00:00:00.000Z" }),
      rec({ id: "after", decidedAt: "2026-06-01T00:00:00.000Z" }),
    ];
    const report = buildGovernanceAuditReport({
      workspaceId: "ws1",
      decisions,
      generatedAt: "2026-06-02T00:00:00.000Z",
      period: { start: "2026-05-10T00:00:00.000Z", end: "2026-05-20T00:00:00.000Z" },
    });
    assert.equal(report.totalDecisions, 1);
    assert.equal(report.decisions[0].id, "inside");
    assert.deepEqual(report.period, {
      start: "2026-05-10T00:00:00.000Z",
      end: "2026-05-20T00:00:00.000Z",
    });
  });

  await t.test("counts every outcome, zero-filled", () => {
    const report = buildGovernanceAuditReport({
      workspaceId: "ws1",
      decisions: [
        rec({ id: "1", outcome: "approved_to_plan" }),
        rec({ id: "2", outcome: "approved_to_plan" }),
        rec({ id: "3", outcome: "rejected" }),
        rec({ id: "4", outcome: "blocked_execution_request" }),
      ],
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    assert.equal(report.countsByOutcome.approved_to_plan, 2);
    assert.equal(report.countsByOutcome.rejected, 1);
    assert.equal(report.countsByOutcome.blocked_execution_request, 1);
    assert.equal(report.countsByOutcome.changes_requested, 0);
    assert.equal(report.countsByOutcome.more_info_requested, 0);
  });

  await t.test("does not mutate its input array or records", () => {
    const input = [rec({ id: "a" }), rec({ id: "b", workspaceId: "ws2" })];
    const snapshot = JSON.parse(JSON.stringify(input));
    buildGovernanceAuditReport({
      workspaceId: "ws1",
      decisions: input,
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    assert.deepEqual(input, snapshot, "input must be untouched");
  });

  await t.test("CSV: header + one row per decision + trailing newline", () => {
    const report = buildGovernanceAuditReport({
      workspaceId: "ws1",
      decisions: [rec({ id: "1" }), rec({ id: "2" })],
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    const csv = formatGovernanceAuditReportCsv(report);
    const lines = csv.split("\n");
    assert.ok(csv.endsWith("\n"), "ends with a trailing newline");
    // header + 2 data rows + the empty string after the final newline
    assert.equal(lines.length, 4);
    assert.equal(
      lines[0],
      "id,workspace_id,work_order_id,bundle_id,outcome,session_status,reviewer_id,reviewer_role,review_id,review_decision,human_on_the_loop,no_execution_authorized,decided_at,created_at",
    );
  });

  await t.test("CSV: null review fields render as empty cells", () => {
    const report = buildGovernanceAuditReport({
      workspaceId: "ws1",
      decisions: [rec({ id: "1", reviewId: undefined, reviewDecision: undefined })],
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    const dataRow = formatGovernanceAuditReportCsv(report).split("\n")[1];
    // review_id and review_decision are columns 9 and 10 (1-indexed) → empty.
    const cells = dataRow.split(",");
    assert.equal(cells[8], "", "review_id empty");
    assert.equal(cells[9], "", "review_decision empty");
  });

  await t.test("CSV: escapes commas, quotes and newlines", () => {
    const report = buildGovernanceAuditReport({
      workspaceId: "ws1",
      decisions: [rec({ id: "1", reviewerRole: 'ceo, "boss"', sessionStatus: "a\nb" })],
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    const csv = formatGovernanceAuditReportCsv(report);
    assert.ok(csv.includes('"ceo, ""boss"""'), "comma + embedded quotes escaped");
    assert.ok(csv.includes('"a\nb"'), "newline-containing field is quoted");
  });

  await t.test("empty input yields a valid, zero-decision report and header-only CSV", () => {
    const report = buildGovernanceAuditReport({
      workspaceId: "ws1",
      decisions: [],
      generatedAt: "2026-05-31T00:00:00.000Z",
    });
    assert.equal(report.totalDecisions, 0);
    assert.equal(report.decisions.length, 0);
    const csv = formatGovernanceAuditReportCsv(report);
    assert.equal(csv.split("\n").length, 2, "header line + trailing newline only");
  });
});
