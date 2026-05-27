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

const confirmationPath = path.join(projectRoot, "src/server/missions/mission-draft-confirmation.ts");
const builderPath = path.join(projectRoot, "src/server/missions/mission-draft-builder.ts");
const sessionPath = path.join(projectRoot, "src/server/missions/mission-draft-session.ts");
const brainPath = path.join(projectRoot, "src/server/joris/brain.ts");
const ledgerRepositoryPath = path.join(projectRoot, "src/server/actions/action-ledger-repository.ts");

const { classifyMissionDraftReply } = await jiti.import(confirmationPath);
const {
  buildMissionDraftPreview,
  MISSION_DRAFT_TTL_MS,
} = await jiti.import(builderPath);
const {
  getPendingMissionDraft,
  setPendingMissionDraft,
  resetMissionDraftSessionForTests,
  isPendingMissionDraftExpired,
} = await jiti.import(sessionPath);
const { runJorisCommand } = await jiti.import(brainPath);
const { getLocalActionLedgerEntriesForSmoke } = await jiti.import(ledgerRepositoryPath);
const { resetLocalMissionDraftsForTests } = await jiti.import(
  path.join(projectRoot, "src/server/missions/mission-draft-repository.ts"),
);

function workspaceContext(workspaceId = "workspace-joris-draft") {
  return {
    activeWorkspace: {
      id: workspaceId,
      slug: workspaceId,
      displayName: workspaceId,
      ownerUserId: "owner_joris_draft",
      modes: [{ id: "hq", label: "HQ" }],
      defaultAssistantId: "joris",
    },
    activeMode: { id: "hq", label: "HQ" },
    activeAgentProfile: {
      id: "joris",
      workspaceId,
      name: "Joris",
      runtimeId: "joris-brain",
      allowedTools: ["calendar.book", "brief.generate"],
    },
    currentOwnerUser: {
      id: "owner_joris_draft",
      email: "owner@example.com",
    },
    workspace: {
      id: workspaceId,
      slug: workspaceId,
      displayName: workspaceId,
      ownerUserId: "owner_joris_draft",
      modes: [{ id: "hq", label: "HQ" }],
      defaultAssistantId: "joris",
    },
    userId: "owner_joris_draft",
    storagePreference: "local",
  };
}

test("classifyMissionDraftReply detects strict confirm and cancel replies", () => {
  assert.equal(classifyMissionDraftReply("confirme"), "confirm");
  assert.equal(classifyMissionDraftReply("oui"), "confirm");
  assert.equal(classifyMissionDraftReply("go"), "confirm");
  assert.equal(classifyMissionDraftReply("annule"), "cancel");
  assert.equal(classifyMissionDraftReply("Book RDV demain 10h"), "none");
  assert.equal(classifyMissionDraftReply("oui book rdv demain"), "ambiguous");
});

test("mission draft preview carries calendar.book metadata and expiry", () => {
  const preview = buildMissionDraftPreview({
    pendingDraftId: "pending_test",
    calendarIntent: {
      title: "RDV test",
      dateISO: "2026-05-28",
      startTime: "10:00",
      endTime: "11:00",
      remindersMinutes: [60, 15],
      needsConfirmation: false,
      confidence: 0.9,
    },
    expiresAt: new Date(Date.now() + MISSION_DRAFT_TTL_MS).toISOString(),
  });

  assert.equal(preview.skillId, "calendar.book");
  assert.equal(preview.actionType, "calendar.book");
  assert.equal(preview.scheduledAt?.startTime, "10:00");
});

test("pending mission draft is unique per workspace and user", () => {
  resetMissionDraftSessionForTests();
  const ctx = workspaceContext();

  const first = setPendingMissionDraft({
    workspaceId: ctx.workspace.id,
    userId: ctx.userId,
    calendarIntent: {
      title: "Premier RDV",
      dateISO: "2026-05-28",
      startTime: "09:00",
      endTime: "10:00",
      remindersMinutes: [15],
      needsConfirmation: false,
      confidence: 0.9,
    },
  });

  const second = setPendingMissionDraft({
    workspaceId: ctx.workspace.id,
    userId: ctx.userId,
    calendarIntent: {
      title: "Deuxième RDV",
      dateISO: "2026-05-29",
      startTime: "11:00",
      endTime: "12:00",
      remindersMinutes: [15],
      needsConfirmation: false,
      confidence: 0.9,
    },
  });

  assert.notEqual(first.pendingDraftId, second.pendingDraftId);
  assert.equal(getPendingMissionDraft(ctx.workspace.id, ctx.userId)?.preview.title, "Deuxième RDV");
});

test("expired pending mission draft is treated as missing", () => {
  resetMissionDraftSessionForTests();
  const ctx = workspaceContext();
  const draft = setPendingMissionDraft({
    workspaceId: ctx.workspace.id,
    userId: ctx.userId,
    calendarIntent: {
      title: "Expiré",
      dateISO: "2026-05-28",
      startTime: "10:00",
      endTime: "11:00",
      remindersMinutes: [15],
      needsConfirmation: false,
      confidence: 0.9,
    },
  });

  draft.expiresAt = new Date(Date.now() - 1_000).toISOString();
  assert.equal(isPendingMissionDraftExpired(draft), true);
  assert.equal(getPendingMissionDraft(ctx.workspace.id, ctx.userId), undefined);
});

test("joris calendar.book proposes mission draft then confirms with missionId on ledger", async () => {
  resetMissionDraftSessionForTests();
  resetLocalMissionDraftsForTests();

  const ctx = workspaceContext(`workspace-joris-draft-${Date.now()}`);
  const stamp = Date.now();
  const proposal = await runJorisCommand(`Book RDV demain 10h00 mission-draft ${stamp}`, ctx);

  assert.equal(proposal.intent, "mission.draft");
  assert.equal(proposal.requiresConfirmation, true);
  assert.ok(proposal.pendingDraftId);
  assert.ok(proposal.missionDraftPreview);
  assert.equal(proposal.calendarEvent, undefined);

  const confirmation = await runJorisCommand("confirme", ctx);

  assert.equal(confirmation.intent, "calendar.book");
  assert.ok(confirmation.calendarEvent);
  assert.ok(confirmation.missionId);
  assert.match(confirmation.missionId, /^mission_draft_/);

  const ledgerEntries = getLocalActionLedgerEntriesForSmoke();
  const calendarEntries = ledgerEntries.filter((entry) => entry.actionType === "calendar.book");
  assert.ok(calendarEntries.length >= 2);

  for (const entry of calendarEntries.slice(-2)) {
    assert.equal(entry.missionId, confirmation.missionId);
    assert.equal(entry.metadata?.missionId, confirmation.missionId);
  }

  const duplicateConfirm = await runJorisCommand("confirme", ctx);
  assert.match(duplicateConfirm.summary, /rien à confirmer/i);
});

test("joris confirm without pending draft returns nothing to confirm", async () => {
  resetMissionDraftSessionForTests();
  const ctx = workspaceContext();
  const result = await runJorisCommand("confirme", ctx);
  assert.match(result.summary, /rien à confirmer/i);
});
