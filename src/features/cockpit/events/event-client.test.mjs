#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("cockpit event client", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const client = await jiti.import(path.join(__dirname, "event-client.ts"));
  const { buildIdeaCapturedPayload } = await jiti.import(path.join(__dirname, "event-record.ts"));

  globalThis.__cockpitEventClientFactory = () => null;
  client.__clearCockpitEventsForTests();

  t.after(() => {
    delete globalThis.__cockpitEventClientFactory;
    client.__clearCockpitEventsForTests();
  });

  await t.test("appends and reads idea.captured events from local fallback", async () => {
    const payload = buildIdeaCapturedPayload({
      rawText: "First durable idea loop",
      capturedAt: "2026-06-05T12:00:00.000Z",
    });

    const saved = await client.appendEvent({
      workspaceId: "michael-hq",
      userId: "00000000-0000-0000-0000-000000000001",
      streamId: "michael-hq:ideas",
      type: "idea.captured",
      payload,
    });

    const events = await client.listIdeaCapturedEvents({
      workspaceId: "michael-hq",
      userId: "00000000-0000-0000-0000-000000000001",
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].id, saved.id);
    assert.equal(events[0].payload.title, "First durable idea loop");
  });

  await t.test("does not leak events across workspaces", async () => {
    const events = await client.listIdeaCapturedEvents({
      workspaceId: "other-workspace",
      userId: "00000000-0000-0000-0000-000000000001",
    });

    assert.deepEqual(events, []);
  });
});
