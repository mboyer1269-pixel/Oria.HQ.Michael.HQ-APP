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
