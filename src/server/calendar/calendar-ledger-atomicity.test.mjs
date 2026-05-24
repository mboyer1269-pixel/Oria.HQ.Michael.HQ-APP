#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

process.env.NODE_ENV = "development";
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const repositoryPath = path.join(projectRoot, "src/server/calendar/calendar-repository.ts");
const servicePath = path.join(projectRoot, "src/server/calendar/calendar-service.ts");

const { createCalendarRepository } = await jiti.import(repositoryPath);
const {
  CalendarServiceError,
  createCalendarEvent,
  listCalendarEvents,
} = await jiti.import(servicePath);

const user = {
  userId: "owner_calendar_atomicity",
  email: "owner@example.com",
  storagePreference: "local",
};

function tomorrowDateISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);

  return date.toISOString().slice(0, 10);
}

test("calendar repository deleteById removes a persisted local event", async () => {
  const repository = createCalendarRepository(user);
  const event = await repository.create({
    title: "Delete me",
    dateISO: tomorrowDateISO(),
    startTime: "10:00",
    endTime: "10:30",
    source: "internal",
    remindersMinutes: [15],
  });

  const deleted = await repository.deleteById(event.id);
  assert.equal(deleted, true);

  const remaining = await repository.list({ limit: 50 });
  assert.equal(remaining.some((entry) => entry.id === event.id), false);
});

test("createCalendarEvent rolls back the calendar event when ledger write fails", async () => {
  const before = await listCalendarEvents({ limit: 100 });

  await assert.rejects(
    () =>
      createCalendarEvent(
        {
          title: "Ledger rollback test",
          dateISO: tomorrowDateISO(),
          startTime: "11:00",
          endTime: "11:30",
          source: "internal",
          confirm: true,
        },
        {
          recordLedger: async () => {
            throw new Error("simulated ledger outage");
          },
        },
      ),
    (error) => {
      assert.ok(error instanceof CalendarServiceError);
      assert.equal(error.code, "CALENDAR_LEDGER_FAILED");
      assert.equal(error.status, 503);

      return true;
    },
  );

  const after = await listCalendarEvents({ limit: 100 });
  assert.equal(after.length, before.length);
});

test("createCalendarEvent exposes recoverable partial state when ledger and rollback both fail", async () => {
  const repository = createCalendarRepository(user);
  repository.deleteById = async () => false;

  const result = await createCalendarEvent(
    {
      title: "Partial ledger failure",
      dateISO: tomorrowDateISO(),
      startTime: "12:00",
      endTime: "12:30",
      source: "internal",
      confirm: true,
    },
    {
      recordLedger: async () => {
        throw new Error("simulated ledger outage");
      },
      calendarRepository: repository,
    },
  );

  assert.equal(result.ledgerStatus, "failed");
  assert.ok(result.event.id);
  assert.equal(result.event.title, "Partial ledger failure");

  const listed = await repository.list({ limit: 100 });
  assert.ok(listed.some((entry) => entry.id === result.event.id));

  const cleanupRepository = createCalendarRepository(user);
  repository.deleteById = cleanupRepository.deleteById.bind(cleanupRepository);
  await repository.deleteById(result.event.id);
});
