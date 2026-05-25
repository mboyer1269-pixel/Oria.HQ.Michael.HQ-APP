#!/usr/bin/env node
/**
 * Joris booking smoke check.
 *
 * Runs `runJorisCommand` in-process with a French booking message and asserts
 * the calendar booking path produces an event. Exits 0 on pass, 1 on fail.
 *
 * Default mode is LOCAL — the script clears MICHAEL_HQ_OWNER_ID and
 * SUPABASE_SERVICE_ROLE_KEY before importing the server so the calendar
 * repository falls back to its in-memory store. No Supabase rows are written.
 *
 * To exercise the real Supabase write path explicitly:
 *   SMOKE_WRITE=1 npm run smoke:joris
 *
 * What this exercises:
 *   - Joris intent detection (message -> "calendar.book")
 *   - Calendar intent parser (French "demain 10h00")
 *   - Permission engine (must allow "calendar-simple")
 *   - Calendar repository write (in-memory by default, Supabase if SMOKE_WRITE=1)
 *   - Action ledger write (mandatory)
 *
 * What this does NOT exercise:
 *   - HTTP route handler (`/api/joris/chat`)
 *   - Zod request validation
 *   - Owner-only auth gate
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Pin storage mode BEFORE importing any server module — serverEnv is computed
// at import time, so once the brain (or anything that pulls in serverEnv) is
// loaded, flipping these env vars no longer has any effect.
const writeMode = process.env.SMOKE_WRITE === "1";
const hadOwnerId = Boolean(process.env.MICHAEL_HQ_OWNER_ID);
const hadServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!writeMode) {
  delete process.env.MICHAEL_HQ_OWNER_ID;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

console.log(
  `[smoke:joris] mode: ${writeMode ? "WRITE (will hit Supabase if configured)" : "LOCAL (no Supabase write)"}`,
);
if (!writeMode && (hadOwnerId || hadServiceRole)) {
  console.log(
    "[smoke:joris] cleared MICHAEL_HQ_OWNER_ID / SUPABASE_SERVICE_ROLE_KEY for this run; set SMOKE_WRITE=1 to keep them",
  );
}

const { createJiti } = await import("jiti");

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    // "server-only" is a Next.js bundler marker with no runtime package; stub
    // it so jiti can load server modules that import it.
    "server-only": path.join(__dirname, "server-only-stub.mjs"),
  },
});

const brainPath = path.join(projectRoot, "src", "server", "joris", "brain.ts");
const ledgerRepositoryPath = path.join(projectRoot, "src", "server", "actions", "action-ledger-repository.ts");
const { runJorisCommand } = await jiti.import(brainPath);
const { getLocalActionLedgerEntriesForSmoke } = await jiti.import(ledgerRepositoryPath);

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

const localLedgerEntries = getLocalActionLedgerEntriesForSmoke();
const lastLedgerEntry = localLedgerEntries.at(-1);
const ledgerMetadata = lastLedgerEntry?.metadata ?? {};

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
  [
    "ledgerStatus is recorded",
    result.ledgerStatus === "recorded",
  ],
  [
    writeMode ? "storageMode set" : "storageMode is local (no Supabase write)",
    writeMode
      ? Boolean(result.storageMode)
      : result.storageMode === "local",
  ],
  ["workspaceId present", Boolean(result.workspaceId)],
  ["modeId present", Boolean(result.modeId)],
  ["assistantId present", Boolean(result.assistantId)],
  ["local ledger entry present", Boolean(lastLedgerEntry)],
  ["ledger metadata workspaceId matches result", ledgerMetadata.workspaceId === result.workspaceId],
  ["ledger metadata modeId matches result", ledgerMetadata.modeId === result.modeId],
  [
    "ledger metadata assistantProfileId matches result",
    ledgerMetadata.assistantProfileId === result.assistantId,
  ],
  [
    "ledger metadata calendarEventId matches event",
    Boolean(result.calendarEvent && ledgerMetadata.calendarEventId === result.calendarEvent.id),
  ],
];

console.log("[smoke:joris] result:");
console.log("  intent:        ", result.intent);
console.log("  modelId:       ", result.modelId);
console.log("  costMode:      ", result.costMode);
console.log("  storageMode:   ", result.storageMode);
console.log("  ledgerStatus:  ", result.ledgerStatus);
console.log("  workspaceId:   ", result.workspaceId);
console.log("  modeId:        ", result.modeId);
console.log("  assistantId:   ", result.assistantId);
console.log("  ledgerMeta:    ", JSON.stringify(ledgerMetadata, null, 2).replace(/\n/g, "\n                 "));
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
