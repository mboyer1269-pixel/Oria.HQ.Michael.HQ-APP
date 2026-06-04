#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const originalNodeEnv = process.env.NODE_ENV;

test.after(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

test("checkExecutionAttempt fails fast in production", async () => {
  process.env.NODE_ENV = "production";

  // Provide mock production environment variables to bypass server-env import validation
  // so we can test the actual checkExecutionAttempt function logic instead of the module load.
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.MICHAEL_HQ_OWNER_ID = "test-owner";
  process.env.MICHAEL_HQ_OWNER_EMAIL = "test@example.com";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const storePath = path.join(projectRoot, "src/server/missions/execution-attempt-store.ts");
  const { checkExecutionAttempt, InMemoryExecutionStoreError } = await jiti.import(storePath);

  assert.throws(
    () =>
      checkExecutionAttempt({
        missionId: "msn_test",
        workspaceId: "michael-hq",
        idempotencyKey: "michael-hq:msn_test:req_1",
      }),
    InMemoryExecutionStoreError,
  );

  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MICHAEL_HQ_OWNER_ID;
  delete process.env.MICHAEL_HQ_OWNER_EMAIL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test("checkExecutionAttempt remains available in development", async () => {
  process.env.NODE_ENV = "development";

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const storePath = path.join(projectRoot, "src/server/missions/execution-attempt-store.ts");
  const { checkExecutionAttempt } = await jiti.import(storePath);

  const result = checkExecutionAttempt({
    missionId: "msn_test",
    workspaceId: "michael-hq",
    idempotencyKey: `michael-hq:msn_test:req_${Date.now()}`,
  });

  assert.equal(result.allowed, true);
});
