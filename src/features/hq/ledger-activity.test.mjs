#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

async function importHelpers() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  return jiti.import(path.join(projectRoot, "src/features/hq/ledger-activity.ts"));
}

test("extractLedgerActivityContext reads calendarEventId from payload metadata", async () => {
  const { extractLedgerActivityContext } = await importHelpers();

  const context = extractLedgerActivityContext({
    id: "act_test",
    userId: "owner",
    actionType: "calendar.book",
    eventType: "action",
    summary: "Création calendrier",
    autonomyLevel: 2,
    requiresConfirmation: true,
    workspaceId: "michael-hq",
    skillId: "calendar.book",
    agentId: "joris",
    payload: {
      effect: { kind: "schedule", operation: "create", target: "calendar_events" },
      metadata: { calendarEventId: "evt_123", modeId: "hq" },
    },
    metadata: { workspaceId: "michael-hq", modeId: "hq" },
    createdAt: "2026-05-27T12:00:00.000Z",
    storageMode: "local",
  });

  assert.equal(context.calendarEventId, "evt_123");
  assert.equal(context.effectKind, "schedule");
  assert.equal(context.effectOperation, "create");
  assert.equal(context.modeId, "hq");
});

test("getLedgerEventTypeLabel maps known event types", async () => {
  const { getLedgerEventTypeLabel } = await importHelpers();

  assert.equal(getLedgerEventTypeLabel("decision"), "Décision");
  assert.equal(getLedgerEventTypeLabel(undefined), "Non typé");
});

test("resolveLedgerMissionId prefers column over metadata", async () => {
  const { resolveLedgerMissionId } = await importHelpers();

  assert.equal(
    resolveLedgerMissionId({
      id: "act_1",
      userId: "owner",
      actionType: "runtime.echo",
      summary: "Echo",
      autonomyLevel: 2,
      requiresConfirmation: false,
      missionId: "mission-column",
      metadata: { missionId: "mission-metadata" },
      createdAt: "2026-05-27T12:00:00.000Z",
      storageMode: "local",
    }),
    "mission-column",
  );
});

test("resolveLedgerMissionId falls back to metadata missionId", async () => {
  const { resolveLedgerMissionId } = await importHelpers();

  assert.equal(
    resolveLedgerMissionId({
      id: "act_2",
      userId: "owner",
      actionType: "runtime.echo",
      summary: "Echo",
      autonomyLevel: 2,
      requiresConfirmation: false,
      metadata: { missionId: "mission-from-metadata" },
      createdAt: "2026-05-27T12:00:00.000Z",
      storageMode: "local",
    }),
    "mission-from-metadata",
  );
});

test("classifyMissionTrace distinguishes linked, orphan, and unknown_ref", async () => {
  const {
    buildMissionLookup,
    classifyMissionTrace,
    summarizeMissionTrace,
  } = await importHelpers();

  const lookup = buildMissionLookup([
    {
      id: "mission-known",
      workspaceId: "michael-hq",
      modeId: "hq",
      title: "Health check",
      status: "active",
      createdAt: "2026-05-27T12:00:00.000Z",
      updatedAt: "2026-05-27T12:00:00.000Z",
    },
  ]);

  const baseEntry = {
    userId: "owner",
    actionType: "runtime.echo",
    summary: "Echo",
    autonomyLevel: 2,
    requiresConfirmation: false,
    createdAt: "2026-05-27T12:00:00.000Z",
    storageMode: "local",
  };

  const linked = classifyMissionTrace(
    { ...baseEntry, id: "act_linked", missionId: "mission-known" },
    lookup,
  );
  assert.equal(linked.kind, "linked");
  assert.equal(linked.missionTitle, "Health check");

  const orphan = classifyMissionTrace({ ...baseEntry, id: "act_orphan" }, lookup);
  assert.equal(orphan.kind, "orphan");

  const unknownRef = classifyMissionTrace(
    { ...baseEntry, id: "act_unknown", missionId: "mission-missing" },
    lookup,
  );
  assert.equal(unknownRef.kind, "unknown_ref");
  assert.equal(unknownRef.missionId, "mission-missing");

  const summary = summarizeMissionTrace(
    [
      { ...baseEntry, id: "act_linked", missionId: "mission-known" },
      { ...baseEntry, id: "act_orphan" },
      { ...baseEntry, id: "act_unknown", missionId: "mission-missing" },
    ],
    lookup,
  );
  assert.deepEqual(summary, { linked: 1, orphan: 1, unknownRef: 1 });
});
