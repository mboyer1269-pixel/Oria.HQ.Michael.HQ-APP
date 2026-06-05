#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("idea.captured events", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { buildIdeaCapturedPayload, ideaCapturedPayloadSchema } = await jiti.import(
    path.join(__dirname, "event-record.ts"),
  );
  const { projectIdeas } = await jiti.import(path.join(__dirname, "idea-projection.ts"));

  await t.test("validates and trims idea.captured payload", () => {
    const result = ideaCapturedPayloadSchema.safeParse({
      title: "  First real loop  ",
      rawText: "  Capture idea -> event -> projection  ",
      capturedAt: "2026-06-05T12:00:00.000Z",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.title, "First real loop");
    assert.equal(result.data.rawText, "Capture idea -> event -> projection");
  });

  await t.test("rejects empty idea.captured payload", () => {
    const result = ideaCapturedPayloadSchema.safeParse({
      title: "",
      rawText: "",
      capturedAt: "2026-06-05T12:00:00.000Z",
    });

    assert.equal(result.success, false);
  });

  await t.test("builds a title from the first non-empty line", () => {
    const payload = buildIdeaCapturedPayload({
      rawText: "\n  Founder cockpit with real event loop\nsecond line",
      capturedAt: "2026-06-05T12:00:00.000Z",
    });

    assert.equal(payload.title, "Founder cockpit with real event loop");
    assert.equal(payload.rawText, "Founder cockpit with real event loop\nsecond line");
  });

  await t.test("projects ideas in stable newest-first order", () => {
    const events = [
      {
        id: "event-a",
        workspaceId: "michael-hq",
        userId: "user-1",
        streamId: "michael-hq:ideas",
        type: "idea.captured",
        payload: {
          title: "Older",
          rawText: "Older idea",
          capturedAt: "2026-06-05T10:00:00.000Z",
        },
        validFrom: null,
        validTo: null,
        recordedAt: "2026-06-05T10:00:00.000Z",
      },
      {
        id: "event-b",
        workspaceId: "michael-hq",
        userId: "user-1",
        streamId: "michael-hq:ideas",
        type: "idea.captured",
        payload: {
          title: "Newer",
          rawText: "Newer idea",
          capturedAt: "2026-06-05T11:00:00.000Z",
        },
        validFrom: null,
        validTo: null,
        recordedAt: "2026-06-05T11:00:00.000Z",
      },
    ];

    assert.deepEqual(
      projectIdeas(events).map((idea) => idea.title),
      ["Newer", "Older"],
    );
  });
});
