#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const originalNodeEnv = process.env.NODE_ENV;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function clearSupabaseAdminEnv() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function importRepository() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const repositoryPath = path.join(projectRoot, "src/server/missions/mission-repository.ts");

  return jiti.import(repositoryPath);
}

test.after(() => {
  process.env.NODE_ENV = originalNodeEnv;

  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }

  if (originalSupabaseServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
});

test("listMissionsForWorkspace uses local seed fallback in development without Supabase", async () => {
  process.env.NODE_ENV = "development";
  clearSupabaseAdminEnv();

  const { listMissionsForWorkspace } = await importRepository();

  const result = await listMissionsForWorkspace({
    workspaceId: "michael-hq",
    modeId: "hq",
  });

  assert.equal(result.source, "local");
  assert.equal(result.workspaceId, "michael-hq");
  assert.equal(result.modeId, "hq");
  assert.ok(result.missions.length > 0);
  assert.ok(result.missions.every((mission) => mission.workspaceId === "michael-hq"));
  assert.ok(result.missions.every((mission) => mission.modeId === "hq"));
  assert.equal(
    result.missions.find((mission) => mission.id === "mission_audit_oria_2026_05_21")?.assignedAgentId,
    "builder",
  );
});

test("listMissionsForWorkspace fails fast in production without Supabase", async () => {
  process.env.NODE_ENV = "production";
  clearSupabaseAdminEnv();

  const { listMissionsForWorkspace } = await importRepository();

  await assert.rejects(
    () =>
      listMissionsForWorkspace({
        workspaceId: "michael-hq",
        modeId: "hq",
      }),
    /Supabase configuration is required for mission persistence in production/,
  );
});
