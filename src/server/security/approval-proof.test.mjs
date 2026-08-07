#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src") },
});

const { computeApprovalProof, computeIntentPayloadHash } = await jiti.import(
  path.join(projectRoot, "src/server/security/approval-proof.ts"),
);

describe("approval proof hashes", () => {
  it("produces stable sha256 payload hash", () => {
    const payload = { actionType: "send_email", missionId: "m1" };
    const a = computeIntentPayloadHash(payload);
    const b = computeIntentPayloadHash(payload);
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it("produces stable approval proof", () => {
    const input = {
      workspaceId: "michael-hq",
      intentId: "intent-1",
      intentPayloadHash: "a".repeat(64),
      approvedByUserId: "ceo-1",
      approvedAt: "2026-08-07T00:00:00.000Z",
    };
    assert.equal(computeApprovalProof(input), computeApprovalProof(input));
  });
});
