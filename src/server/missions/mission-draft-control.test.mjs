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

const formatPath = path.join(projectRoot, "src/features/hq/mission-draft-format.ts");
const controlPath = path.join(projectRoot, "src/server/missions/mission-draft-control.ts");
const sessionPath = path.join(projectRoot, "src/server/missions/mission-draft-session.ts");
const brainPath = path.join(projectRoot, "src/server/joris/brain.ts");

const {
  mapCancelDraftResponse,
  mapConfirmDraftResponse,
  mapPendingLoadToUxState,
  MISSION_DRAFT_UNAVAILABLE_NO_PENDING,
  isMissionDraftActionInFlight,
} = await jiti.import(formatPath);

const { confirmPendingMissionDraft, cancelPendingMissionDraft, getMissionDraftPendingView, buildRoute } =
  await jiti.import(controlPath);

const { resetMissionDraftSessionForTests } = await jiti.import(sessionPath);
const { runJorisCommand } = await jiti.import(brainPath);
const { resetLocalMissionDraftsForTests } = await jiti.import(
  path.join(projectRoot, "src/server/missions/mission-draft-repository.ts"),
);

function workspaceContext(workspaceId = "workspace-draft-ux") {
  return {
    activeWorkspace: {
      id: workspaceId,
      slug: workspaceId,
      displayName: workspaceId,
      ownerUserId: "owner_draft_ux",
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
      id: "owner_draft_ux",
      email: "owner@example.com",
    },
    workspace: {
      id: workspaceId,
      slug: workspaceId,
      displayName: workspaceId,
      ownerUserId: "owner_draft_ux",
      modes: [{ id: "hq", label: "HQ" }],
      defaultAssistantId: "joris",
    },
    userId: "owner_draft_ux",
    storagePreference: "local",
  };
}

const calendarIntent = {
  title: "RDV UX test",
  dateISO: "2026-06-10",
  startTime: "10:00",
  endTime: "11:00",
  remindersMinutes: [15],
  needsConfirmation: false,
  confidence: 0.9,
};

test("mapPendingLoadToUxState maps GET pending shapes", () => {
  assert.equal(
    mapPendingLoadToUxState({ loading: true, pending: null, dismissedExpired: false }),
    "loading",
  );
  assert.equal(
    mapPendingLoadToUxState({
      loading: false,
      pending: { status: "none" },
      dismissedExpired: false,
    }),
    "idle",
  );
  assert.equal(
    mapPendingLoadToUxState({
      loading: false,
      pending: { status: "active", preview: { title: "x" } },
      dismissedExpired: false,
    }),
    "active",
  );
  assert.equal(
    mapPendingLoadToUxState({
      loading: false,
      pending: { status: "expired" },
      dismissedExpired: false,
    }),
    "expired",
  );
  assert.equal(
    mapPendingLoadToUxState({
      loading: false,
      pending: { status: "expired" },
      dismissedExpired: true,
    }),
    "idle",
  );
});

test("mapConfirmDraftResponse maps confirm without pending to unavailable", async () => {
  resetMissionDraftSessionForTests();
  const ctx = workspaceContext();

  const result = await confirmPendingMissionDraft(ctx);
  const mapped = mapConfirmDraftResponse(result);

  assert.equal(mapped.outcome, "unavailable");
  assert.equal(mapped.message, MISSION_DRAFT_UNAVAILABLE_NO_PENDING);
});

test("mapConfirmDraftResponse maps mismatched pendingDraftId to unavailable", async () => {
  resetMissionDraftSessionForTests();
  const ctx = workspaceContext(`workspace-mismatch-${Date.now()}`);

  await runJorisCommand("Book RDV 2026-06-11 10h00 mismatch ux", ctx);

  const result = await confirmPendingMissionDraft(ctx, { pendingDraftId: "pending_wrong" });
  const mapped = mapConfirmDraftResponse(result);

  assert.equal(mapped.outcome, "unavailable");
  assert.match(mapped.message, /ne correspond plus/i);
});

test("mapCancelDraftResponse maps cancel to cancelled", async () => {
  resetMissionDraftSessionForTests();
  const ctx = workspaceContext(`workspace-cancel-${Date.now()}`);

  const proposal = await runJorisCommand("Book RDV 2026-06-12 11h00 cancel ux", ctx);
  assert.ok(proposal.pendingDraftId);

  const result = cancelPendingMissionDraft(ctx, { pendingDraftId: proposal.pendingDraftId });
  const mapped = mapCancelDraftResponse(result);

  assert.equal(mapped.outcome, "cancelled");
  assert.match(mapped.message, /annulée/i);
});

test("expired GET pending payload maps to expired UX state", () => {
  const clientView = {
    status: "expired",
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
    pendingDraftId: "pending_expired_sample",
    preview: {
      title: calendarIntent.title,
      objective: "Test",
      skillId: "calendar.book",
      actionType: "calendar.book",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    },
  };

  assert.equal(
    mapPendingLoadToUxState({ loading: false, pending: clientView, dismissedExpired: false }),
    "expired",
  );
  assert.equal(
    mapPendingLoadToUxState({ loading: false, pending: clientView, dismissedExpired: true }),
    "idle",
  );
});

test("isMissionDraftActionInFlight blocks duplicate POST while confirming or cancelling", () => {
  assert.equal(isMissionDraftActionInFlight("confirming"), true);
  assert.equal(isMissionDraftActionInFlight("cancelling"), true);
  assert.equal(isMissionDraftActionInFlight("active"), false);
});

test("mapConfirmDraftResponse maps successful calendar.book to confirmed", async () => {
  resetMissionDraftSessionForTests();
  resetLocalMissionDraftsForTests();
  const ctx = workspaceContext(`workspace-confirm-ok-${Date.now()}`);

  await runJorisCommand("Book RDV 2026-06-13 14h00 confirm ok", ctx);
  const pending = getMissionDraftPendingView(ctx);
  assert.equal(pending.status, "active");

  const result = await confirmPendingMissionDraft(ctx, { pendingDraftId: pending.pendingDraftId });
  const mapped = mapConfirmDraftResponse(result);

  assert.equal(mapped.outcome, "confirmed");
  assert.ok(mapped.missionId);
  assert.ok(mapped.calendarEvent);
});

test("shadow tagging: buildRoute tags the mission-draft route via the ladder, output unchanged", () => {
  resetMissionDraftSessionForTests();
  const ctx = workspaceContext(`workspace-tag-${Date.now()}`);

  // The router receives a taskClass → the returned decision is governed by the
  // ladder (via: "cost-ladder"). Reading the return value avoids any reliance on
  // shared module state. No provider is called; the ladder stays display_only.
  const decision = buildRoute("annule");
  assert.equal(decision.via, "cost-ladder");

  // Output behaviour is identical: no pending draft → the existing "nothing to
  // cancel" response, still carrying route metadata.
  const result = cancelPendingMissionDraft(ctx);
  assert.equal(result.intent, "chat");
  assert.match(result.summary, /aucune mission draft en attente/i);
  assert.ok(result.modelId, "route metadata is still surfaced (behaviour identical)");
  assert.ok(result.costMode);
});
