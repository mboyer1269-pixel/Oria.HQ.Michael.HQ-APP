#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const packetMod = await jiti.import(path.join(__dirname, "studio-campaign-packet.ts"));
const planMod = await jiti.import(path.join(__dirname, "studio-prep-plan.ts"));
const {
  buildStudioPreparedCampaign,
  validateStudioPreparedCampaign,
  isStudioCampaignProposalOnly,
} = packetMod;
const { computeStudioPrepPlan } = planMod;

const NOW = "2026-07-11T12:00:00.000Z";

function samplePacket(overrides = {}) {
  return {
    packetId: "pkt_1",
    ventureId: "venture-default",
    theme: "Visibility",
    audience: "Operators",
    channel: "linkedin_post",
    draftCopy: "Prepare, then publish.",
    callToAction: "Review in HQ",
    rationale: "Heartbeat",
    createdAt: NOW,
    ...overrides,
  };
}

test("studio campaign packet + prep plan", async (t) => {
  await t.test("builder locks governance to proposal-only", () => {
    const campaign = buildStudioPreparedCampaign({
      preparedCampaignId: "scamp_1",
      ventureId: "venture-default",
      packetId: "pkt_1",
      packet: samplePacket(),
      priority: "high",
      priorityScore: 75,
      status: "ready_for_ceo_review",
      createdAt: NOW,
    });
    assert.equal(campaign.requiresCeoApproval, true);
    assert.equal(campaign.requiresManualPublish, true);
    assert.equal(campaign.noExecutionAuthorized, true);
    assert.equal(isStudioCampaignProposalOnly(campaign), true);
    assert.equal(validateStudioPreparedCampaign(campaign).valid, true);
  });

  await t.test("planner enqueues new and dedupes identical", () => {
    const packet = samplePacket();
    const first = computeStudioPrepPlan({
      candidates: [{ packet }],
      existing: [],
      createdAt: NOW,
    });
    assert.equal(first.summary.created, 1);
    assert.equal(first.summary.enqueued, 1);

    const second = computeStudioPrepPlan({
      candidates: [{ packet }],
      existing: first.toEnqueue.map((e) => e.campaign),
      createdAt: NOW,
    });
    assert.equal(second.summary.deduped, 1);
    assert.equal(second.summary.enqueued, 0);
  });

  await t.test("planner refreshes when draft changes", () => {
    const packet = samplePacket();
    const first = computeStudioPrepPlan({
      candidates: [{ packet }],
      existing: [],
      createdAt: NOW,
    });
    const refreshed = computeStudioPrepPlan({
      candidates: [{ packet: samplePacket({ draftCopy: "Updated draft copy." }) }],
      existing: first.toEnqueue.map((e) => e.campaign),
      createdAt: "2026-07-11T13:00:00.000Z",
    });
    assert.equal(refreshed.summary.refreshed, 1);
    assert.equal(refreshed.toEnqueue[0].kind, "refresh");
    assert.ok(refreshed.toEnqueue[0].supersedesId);
  });
});
