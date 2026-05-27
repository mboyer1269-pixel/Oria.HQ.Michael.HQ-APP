#!/usr/bin/env node
/**
 * Joris booking smoke check.
 *
 * Runs `runJorisCommand` in-process with a French booking message and asserts
 * the mission-draft confirmation path produces an event linked to a mission.
 * Exits 0 on pass, 1 on fail.
 *
 * Default mode is LOCAL — the script clears MICHAEL_HQ_OWNER_ID and
 * SUPABASE_SERVICE_ROLE_KEY before importing the server so the calendar
 * repository falls back to its in-memory store. No Supabase rows are written.
 *
 * To exercise the real Supabase write path explicitly:
 *   SMOKE_WRITE=1 npm run smoke:joris
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

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
    "server-only": path.join(__dirname, "server-only-stub.mjs"),
  },
});

const brainPath = path.join(projectRoot, "src", "server", "joris", "brain.ts");
const ledgerRepositoryPath = path.join(projectRoot, "src", "server", "actions", "action-ledger-repository.ts");
const { runJorisCommand } = await jiti.import(brainPath);
const { getLocalActionLedgerEntriesForSmoke } = await jiti.import(ledgerRepositoryPath);

const stamp = new Date().toISOString().slice(11, 16);
const message = `Book RDV demain 10h00 smoke-test ${stamp}`;

console.log(`[smoke:joris] proposal message: ${JSON.stringify(message)}`);

let proposal;
try {
  proposal = await runJorisCommand(message);
} catch (err) {
  console.error("[smoke:joris] runJorisCommand (proposal) threw:", err);
  process.exit(1);
}

console.log(`[smoke:joris] confirm message: "confirme"`);

let result;
try {
  result = await runJorisCommand("confirme");
} catch (err) {
  console.error("[smoke:joris] runJorisCommand (confirm) threw:", err);
  process.exit(1);
}

const localLedgerEntries = getLocalActionLedgerEntriesForSmoke();
const calendarLedgerEntries = localLedgerEntries.filter((entry) => entry.actionType === "calendar.book");
const lastLedgerEntry = calendarLedgerEntries.at(-1);
const ledgerMetadata = lastLedgerEntry?.metadata ?? {};

const checks = [
  ["proposal intent === mission.draft", proposal.intent === "mission.draft"],
  ["proposal requiresConfirmation", proposal.requiresConfirmation === true],
  ["proposal pendingDraftId present", Boolean(proposal.pendingDraftId)],
  ["confirm intent === calendar.book", result.intent === "calendar.book"],
  ["calendarEvent present", Boolean(result.calendarEvent)],
  [
    "calendarEvent.startTime is HH:mm",
    Boolean(result.calendarEvent && /^\d{2}:\d{2}$/.test(result.calendarEvent.startTime)),
  ],
  [
    "calendarEvent.title contains smoke-test",
    Boolean(result.calendarEvent && /smoke-test/i.test(result.calendarEvent.title)),
  ],
  ["missionId present on confirm", Boolean(result.missionId)],
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
  ["ledger missionId matches confirm missionId", lastLedgerEntry?.missionId === result.missionId],
  ["ledger metadata missionId matches confirm missionId", ledgerMetadata.missionId === result.missionId],
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

console.log("[smoke:joris] proposal:");
console.log("  intent:         ", proposal.intent);
console.log("  pendingDraftId: ", proposal.pendingDraftId);
console.log("  requiresConfirmation:", proposal.requiresConfirmation);

console.log("[smoke:joris] confirm result:");
console.log("  intent:        ", result.intent);
console.log("  missionId:     ", result.missionId);
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
