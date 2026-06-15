#!/usr/bin/env node

// Calendar critical path (offline): the assistant tool-gate. An assistant whose
// allowedTools does not include "calendar.book" must be refused BEFORE any
// ledger write or calendar create. No external calendar call.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

process.env.NODE_ENV = "development";

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { createCalendarEvent, CalendarServiceError } = await jiti.import(
  path.join(projectRoot, "src/server/calendar/calendar-service.ts"),
);

/** Workspace context whose active assistant may NOT use calendar.book. */
function contextWithoutCalendarTool() {
  const workspace = {
    id: "michael-hq",
    slug: "michael-hq",
    displayName: "michael-hq",
    ownerUserId: "owner_calendar_authz",
    modes: [{ id: "hq", label: "HQ" }],
    defaultAssistantId: "joris",
  };
  return {
    activeWorkspace: workspace,
    activeMode: { id: "hq", label: "HQ" },
    activeAgentProfile: {
      id: "joris",
      workspaceId: workspace.id,
      name: "Joris",
      runtimeId: "joris-brain",
      allowedTools: ["brief.generate"], // no calendar.book
    },
    currentOwnerUser: { id: workspace.ownerUserId, email: "owner@example.com" },
    workspace,
    userId: workspace.ownerUserId,
    storagePreference: "local",
  };
}

test("createCalendarEvent refuses an assistant not allowed to use calendar.book", async () => {
  let ledgerCalls = 0;
  let createCalls = 0;

  const recordLedger = async () => {
    ledgerCalls += 1;
  };
  const calendarRepository = {
    mode: "local",
    async create() {
      createCalls += 1;
      return null;
    },
    async list() {
      return [];
    },
    async deleteById() {
      return false;
    },
  };

  await assert.rejects(
    () =>
      createCalendarEvent(
        {
          title: "Should be blocked",
          dateISO: "2026-12-01",
          startTime: "09:00",
          endTime: "09:30",
          source: "internal",
          confirm: true,
        },
        { workspaceContext: contextWithoutCalendarTool(), recordLedger, calendarRepository },
      ),
    (error) => {
      assert.ok(error instanceof CalendarServiceError);
      assert.equal(error.code, "CALENDAR_FORBIDDEN");
      assert.equal(error.status, 403);
      return true;
    },
  );

  // Gate runs before any side effect: nothing is ledgered or created.
  assert.equal(ledgerCalls, 0);
  assert.equal(createCalls, 0);
});
