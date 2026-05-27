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
