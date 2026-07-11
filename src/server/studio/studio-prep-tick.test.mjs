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

const storeMod = await jiti.import(path.join(__dirname, "studio-campaign-store.ts"));
const tickMod = await jiti.import(path.join(__dirname, "studio-prep-tick.ts"));
const {
  clearStudioCampaignStore,
  listStudioPreparedCampaigns,
  listReviewableStudioCampaigns,
} = storeMod;
const { runStudioPrepTick, buildDefaultStudioHeartbeatPackets } = tickMod;

test("studio-prep-tick prepare-only", async (t) => {
  clearStudioCampaignStore();

  await t.test("heartbeat defaults enqueue without publish authority", async () => {
    const nowIso = "2026-07-11T12:00:00.000Z";
    const packets = buildDefaultStudioHeartbeatPackets(nowIso);
    const result = await runStudioPrepTick({
      workspaceId: "ws-test",
      userId: "user-1",
      packets,
    });
    assert.equal(result.publishAuthorized, false);
    assert.ok(result.enqueued.length >= 1);
    assert.ok(result.enqueued.every((c) => c.noExecutionAuthorized === true));
    assert.ok(result.enqueued.every((c) => c.requiresManualPublish === true));
    assert.equal(listStudioPreparedCampaigns("ws-test").length, result.enqueued.length);
    assert.equal(listReviewableStudioCampaigns("ws-test").length, result.enqueued.length);
  });

  await t.test("second identical tick dedupes", async () => {
    clearStudioCampaignStore();
    const nowIso = "2026-07-11T12:00:00.000Z";
    const packets = buildDefaultStudioHeartbeatPackets(nowIso);
    await runStudioPrepTick({ workspaceId: "ws-dedupe", userId: "user-1", packets });
    const second = await runStudioPrepTick({
      workspaceId: "ws-dedupe",
      userId: "user-1",
      packets,
    });
    assert.equal(second.plan.summary.deduped, packets.length);
    assert.equal(second.enqueued.length, 0);
  });

  await t.test("reviewable list hides superseded rows after refresh", async () => {
    clearStudioCampaignStore();
    const nowIso = "2026-07-11T12:00:00.000Z";
    const [packet] = buildDefaultStudioHeartbeatPackets(nowIso);
    await runStudioPrepTick({
      workspaceId: "ws-refresh",
      userId: "user-1",
      packets: [packet],
    });
    await runStudioPrepTick({
      workspaceId: "ws-refresh",
      userId: "user-1",
      packets: [{ ...packet, draftCopy: "Updated draft for refresh path." }],
    });
    const all = listStudioPreparedCampaigns("ws-refresh");
    const reviewable = listReviewableStudioCampaigns("ws-refresh");
    assert.ok(all.length >= 2);
    assert.ok(all.some((c) => c.status === "superseded"));
    assert.ok(reviewable.every((c) => c.status === "ready_for_ceo_review" || c.status === "prepared"));
    assert.ok(!reviewable.some((c) => c.status === "superseded"));
  });
});
