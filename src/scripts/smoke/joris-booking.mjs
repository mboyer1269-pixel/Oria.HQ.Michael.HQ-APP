#!/usr/bin/env node
/**
 * Joris booking smoke check.
 *
 * Runs `runJorisCommand` in-process with a French booking message and asserts
 * the calendar booking path produces an event. Exits 0 on pass, 1 on fail.
 *
 * Run from the project root:
 *   npm run smoke:joris
 *
 * What this exercises:
 *   - Joris intent detection (message -> "calendar.book")
 *   - Calendar intent parser (French "demain 10h00")
 *   - Permission engine (must allow "calendar-simple")
 *   - Calendar repository write (Supabase if configured, else local memory)
 *   - Action ledger write (best-effort)
 *
 * What this does NOT exercise:
 *   - HTTP route handler (`/api/joris/chat`)
 *   - Zod request validation
 *   - Owner-only auth gate
 *
 * If MICHAEL_HQ_OWNER_ID + SUPABASE_SERVICE_ROLE_KEY are set, this writes a
 * real calendar_events row to Supabase. The event title starts with
 * "Smoke-test" so you can spot and delete it after the run.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    // "server-only" is a Next.js bundler marker with no runtime package; stub
    // it so jiti can load server modules that import it.
    "server-only": path.join(__dirname, "server-only-stub.mjs"),
  },
});

const brainPath = path.join(projectRoot, "src", "server", "joris", "brain.ts");
const { runJorisCommand } = await jiti.import(brainPath);

const stamp = new Date().toISOString().slice(11, 16); // HH:MM
const message = `Book RDV demain 10h00 smoke-test ${stamp}`;

console.log(`[smoke:joris] message: ${JSON.stringify(message)}`);

let result;
try {
  result = await runJorisCommand(message);
} catch (err) {
  console.error("[smoke:joris] runJorisCommand threw:", err);
  process.exit(1);
}

const checks = [
  ["intent === calendar.book", result.intent === "calendar.book"],
  ["calendarEvent present", Boolean(result.calendarEvent)],
  [
    "calendarEvent.startTime is HH:mm",
    Boolean(result.calendarEvent && /^\d{2}:\d{2}$/.test(result.calendarEvent.startTime)),
  ],
  [
    "calendarEvent.title contains smoke-test",
    Boolean(result.calendarEvent && /smoke-test/i.test(result.calendarEvent.title)),
  ],
  ["ledgerStatus is recorded or failed (not undefined)", result.ledgerStatus === "recorded" || result.ledgerStatus === "failed"],
];

console.log("[smoke:joris] result:");
console.log("  intent:        ", result.intent);
console.log("  modelId:       ", result.modelId);
console.log("  costMode:      ", result.costMode);
console.log("  storageMode:   ", result.storageMode);
console.log("  ledgerStatus:  ", result.ledgerStatus);
console.log("  calendarEvent: ", result.calendarEvent ? JSON.stringify(result.calendarEvent, null, 2).replace(/\n/g, "\n                 ") : "(none)");
console.log("  summary:       ", result.summary);

const failed = checks.filter(([, pass]) => !pass);

console.log("[smoke:joris] checks:");
for (const [name, pass] of checks) {
  console.log(`  [${pass ? "ok" : "fail"}] ${name}`);
}

if (failed.length > 0) {
  console.error(`[smoke:joris] FAIL — ${failed.length} check(s) failed`);
  process.exit(1);
}

if (result.storageMode === "supabase" && result.calendarEvent) {
  console.log(`[smoke:joris] note: wrote calendar_events id=${result.calendarEvent.id} to Supabase. Delete manually if undesired.`);
}

console.log("[smoke:joris] PASS");
process.exit(0);
