#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Approval Record Repository (Fallback) tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  // Test relies on natural fallback:
  // process.env.NODE_ENV is not "production", so local fallback is allowed.
  // No Supabase vars are set, so admin client returns null.

  const { insertMissionApprovalRecord, getMissionApprovalRecord, __clearMockApprovalRecords } = await jiti.import(
    path.join(__dirname, "approval-record-repository.ts")
  );

  t.afterEach(() => {
    __clearMockApprovalRecords();
  });

  const sampleRecord = {
    id: "appr_123",
    missionId: "msn_456",
    status: "approved",
    approvalScope: ["transition_to_running"],
    approvedBy: "local-michael",
    approvedAt: "2026-05-28T12:00:00.000Z",
    createdAt: "2026-05-28T11:00:00.000Z",
  };

  await t.test("can insert and retrieve an approval record from local fallback", async () => {
    await insertMissionApprovalRecord(sampleRecord);
    const retrieved = await getMissionApprovalRecord("msn_456");

    assert.ok(retrieved);
    assert.deepEqual(retrieved, sampleRecord);
  });

  await t.test("returns null if no record exists for missionId", async () => {
    const retrieved = await getMissionApprovalRecord("msn_missing");
    assert.equal(retrieved, null);
  });

  await t.test("retrieves the most recent record when multiple exist", async () => {
    await insertMissionApprovalRecord(sampleRecord);
    const newerRecord = { ...sampleRecord, id: "appr_124", status: "rejected" };
    await insertMissionApprovalRecord(newerRecord);

    const retrieved = await getMissionApprovalRecord("msn_456");
    assert.ok(retrieved);
    assert.equal(retrieved.id, "appr_124");
    assert.equal(retrieved.status, "rejected");
  });
});
