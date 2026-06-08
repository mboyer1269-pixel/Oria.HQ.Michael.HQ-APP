#!/usr/bin/env node

/**
 * mission-draft-durable-repository.test.mjs
 *
 * - persistMissionDraftDurable fails closed without a Supabase admin client.
 * - saveMissionDraft with the flag OFF (default) delegates to the local
 *   in-memory repository — i.e. current behavior is unchanged.
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const original = {
  nodeEnv: process.env.NODE_ENV,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  flag: process.env.MISSION_DURABLE_DRAFTS,
};

// Local-allowed dev env, no Supabase, durable flag OFF.
process.env.NODE_ENV = "development";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.MISSION_DURABLE_DRAFTS;

test.after(() => {
  const restore = (k, v) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  restore("NODE_ENV", original.nodeEnv);
  restore("NEXT_PUBLIC_SUPABASE_URL", original.url);
  restore("SUPABASE_SERVICE_ROLE_KEY", original.key);
  restore("MISSION_DURABLE_DRAFTS", original.flag);
});

async function loadModules() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  const durable = await jiti.import(
    path.join(projectRoot, "src/server/missions/mission-draft-durable-repository.ts"),
  );
  const repo = await jiti.import(
    path.join(projectRoot, "src/server/missions/mission-draft-repository.ts"),
  );
  return { durable, repo };
}

function sampleDraft(id) {
  return {
    id,
    workspaceId: "ws-test",
    modeId: "mode-test",
    title: "Draft mission",
    objective: "Test objective",
    assignedAgentId: "agent-test",
    autonomyLevel: 0,
    status: "draft",
    riskLevel: "low",
    input: {},
    expectedOutput: "",
    requiresApproval: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("persistMissionDraftDurable fails closed without a Supabase admin client", async () => {
  const { durable } = await loadModules();
  await assert.rejects(
    () => durable.persistMissionDraftDurable(sampleDraft("msn_durable_1")),
    /requires a configured Supabase admin client/,
  );
});

test("saveMissionDraft with the flag OFF delegates to the local repository", async () => {
  const { repo } = await loadModules();
  repo.resetLocalMissionDraftsForTests();

  const draft = sampleDraft("msn_local_1");
  const saved = await repo.saveMissionDraft(draft);

  assert.equal(saved.id, "msn_local_1");
  const localDrafts = repo.listLocalMissionDrafts("ws-test");
  assert.equal(localDrafts.length, 1);
  assert.equal(localDrafts[0].id, "msn_local_1");
});
