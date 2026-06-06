#!/usr/bin/env node
// Tests for daily-direction-projection.ts and daily.direction.generated event schemas.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

// Valid v4 UUIDs required — Zod 4 validates UUID version bits strictly.
const FAKE_UUID_1 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const FAKE_UUID_2 = "6ba7b811-9dad-41d1-80b4-00c04fd430c8";
const FAKE_UUID_3 = "550e8400-e29b-41d4-a716-446655440000";

function makeDirectionRecord(overrides = {}) {
  return {
    id: FAKE_UUID_1,
    workspaceId: "michael-hq",
    userId: FAKE_UUID_2,
    streamId: "michael-hq:daily-direction",
    type: "daily.direction.generated",
    validFrom: null,
    validTo: null,
    recordedAt: "2026-06-06T08:00:00.000Z",
    payload: {
      dateIso: "2026-06-06",
      outcomes: [
        { text: "Outcome 1", sourceEventIds: [FAKE_UUID_3] },
        { text: "Outcome 2", sourceEventIds: [] },
        { text: "Outcome 3", sourceEventIds: [] },
      ],
      cashAction: { text: "Action cash", sourceEventIds: [FAKE_UUID_3] },
      buildAction: { text: "Action build", sourceEventIds: [] },
      decisionToMake: { text: "Décision à prendre", sourceEventIds: [] },
      thingToCut: { text: "Chose à ignorer", sourceEventIds: [] },
      generatorEventIds: [FAKE_UUID_3],
      isZeroState: false,
      zeroStateMessage: null,
      generatedAt: "2026-06-06T08:00:00.000Z",
    },
    ...overrides,
  };
}

test("daily.direction.generated schemas + projection", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const {
    dailyDirectionPayloadSchema,
    dailyDirectionEventRecordSchema,
    eventTypeSchema,
  } = await jiti.import(path.join(__dirname, "event-record.ts"));

  const { projectTodayDailyDirection } = await jiti.import(
    path.join(__dirname, "daily-direction-projection.ts"),
  );

  // -------------------------------------------------------------------------
  // Event type schema
  // -------------------------------------------------------------------------

  await t.test("eventTypeSchema accepts idea.captured and daily.direction.generated", () => {
    assert.equal(eventTypeSchema.safeParse("idea.captured").success, true);
    assert.equal(eventTypeSchema.safeParse("daily.direction.generated").success, true);
    assert.equal(eventTypeSchema.safeParse("unknown.type").success, false);
  });

  // -------------------------------------------------------------------------
  // DailyDirectionPayload validation
  // -------------------------------------------------------------------------

  await t.test("validates a correct DailyDirectionPayload", () => {
    const record = makeDirectionRecord();
    const result = dailyDirectionPayloadSchema.safeParse(record.payload);
    assert.equal(result.success, true, JSON.stringify(result.error?.issues));
  });

  await t.test("rejects payload with wrong number of outcomes", () => {
    const payload = {
      ...makeDirectionRecord().payload,
      outcomes: [{ text: "Only one", sourceEventIds: [] }],
    };
    const result = dailyDirectionPayloadSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  await t.test("rejects payload with bad dateIso format", () => {
    const payload = { ...makeDirectionRecord().payload, dateIso: "06-06-2026" };
    const result = dailyDirectionPayloadSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  await t.test("accepts zero-state payload", () => {
    const payload = {
      ...makeDirectionRecord().payload,
      generatorEventIds: [],
      isZeroState: true,
      zeroStateMessage: "Capture une première idée.",
    };
    const result = dailyDirectionPayloadSchema.safeParse(payload);
    assert.equal(result.success, true, JSON.stringify(result.error?.issues));
  });

  // -------------------------------------------------------------------------
  // DailyDirectionEventRecord validation
  // -------------------------------------------------------------------------

  await t.test("validates a complete DailyDirectionEventRecord", () => {
    const result = dailyDirectionEventRecordSchema.safeParse(makeDirectionRecord());
    assert.equal(result.success, true, JSON.stringify(result.error?.issues));
  });

  await t.test("rejects a record with wrong type", () => {
    const result = dailyDirectionEventRecordSchema.safeParse({
      ...makeDirectionRecord(),
      type: "idea.captured",
    });
    assert.equal(result.success, false);
  });

  // -------------------------------------------------------------------------
  // projectTodayDailyDirection
  // -------------------------------------------------------------------------

  await t.test("returns null when no events for today", () => {
    const result = projectTodayDailyDirection([], "2026-06-06");
    assert.equal(result, null);
  });

  await t.test("returns null when event is for a different date", () => {
    const record = dailyDirectionEventRecordSchema.parse(makeDirectionRecord());
    const result = projectTodayDailyDirection([record], "2026-06-07");
    assert.equal(result, null);
  });

  await t.test("returns projection for today", () => {
    const record = dailyDirectionEventRecordSchema.parse(makeDirectionRecord());
    const result = projectTodayDailyDirection([record], "2026-06-06");
    assert.ok(result !== null);
    assert.equal(result.eventId, FAKE_UUID_1);
    assert.equal(result.payload.dateIso, "2026-06-06");
  });

  await t.test("returns the newest event when multiple exist for today", () => {
    const older = dailyDirectionEventRecordSchema.parse(
      makeDirectionRecord({ id: "00000000-0000-0000-0000-000000000010", recordedAt: "2026-06-06T08:00:00.000Z" }),
    );
    const newer = dailyDirectionEventRecordSchema.parse(
      makeDirectionRecord({ id: "00000000-0000-0000-0000-000000000011", recordedAt: "2026-06-06T09:00:00.000Z" }),
    );
    const result = projectTodayDailyDirection([older, newer], "2026-06-06");
    assert.ok(result !== null);
    assert.equal(result.eventId, "00000000-0000-0000-0000-000000000011");
  });

  // -------------------------------------------------------------------------
  // sourceEventIds traceability
  // -------------------------------------------------------------------------

  await t.test("sourceEventIds are preserved in the projection payload", () => {
    const record = dailyDirectionEventRecordSchema.parse(makeDirectionRecord());
    const result = projectTodayDailyDirection([record], "2026-06-06");
    assert.ok(result !== null);
    assert.deepEqual(result.payload.cashAction.sourceEventIds, [FAKE_UUID_3]);
    assert.deepEqual(result.payload.generatorEventIds, [FAKE_UUID_3]);
  });
});
