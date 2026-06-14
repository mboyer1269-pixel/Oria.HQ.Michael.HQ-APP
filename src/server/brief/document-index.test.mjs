#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const indexPath = path.join(__dirname, "document-index.ts");

// A throwaway fixture OUTSIDE the repo (never db/documents.json) so the test can
// never write to or depend on the tracked fixture.
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "oria-doc-index-"));
const fixturePath = path.join(tmpDir, "documents.json");
writeFileSync(
  fixturePath,
  JSON.stringify([
    { id: "d1", filename: "plan.md", hat: "hq", created_at: "2026-06-01T00:00:00.000Z" },
  ]),
);

const ENV_KEYS = ["NODE_ENV", "ORIA_UNSAFE_ALLOW_FILE_DOCUMENT_STORE_IN_PROD"];
const SAVED = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function setEnv(k, v) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

test.after(() => {
  for (const k of ENV_KEYS) setEnv(k, SAVED[k]);
  rmSync(tmpDir, { recursive: true, force: true });
});

test("document index — dev/test reads, prod fail-closed", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  const { getDocumentBriefSnapshot } = await jiti.import(indexPath);

  await t.test("dev/test reads the JSON fixture", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("ORIA_UNSAFE_ALLOW_FILE_DOCUMENT_STORE_IN_PROD", undefined);

    const snapshot = await getDocumentBriefSnapshot(3, fixturePath);

    assert.equal(snapshot.totalCount, 1);
    assert.equal(snapshot.recent[0].filename, "plan.md");
    assert.equal(snapshot.byHat.hq, 1);
  });

  await t.test("production without opt-in refuses the file store (empty, file not read)", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("ORIA_UNSAFE_ALLOW_FILE_DOCUMENT_STORE_IN_PROD", undefined);

    const snapshot = await getDocumentBriefSnapshot(3, fixturePath);

    assert.equal(snapshot.totalCount, 0);
    assert.deepEqual(snapshot.recent, []);
  });

  await t.test("production reads only with the explicit unsafe break-glass flag", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("ORIA_UNSAFE_ALLOW_FILE_DOCUMENT_STORE_IN_PROD", "true");

    const snapshot = await getDocumentBriefSnapshot(3, fixturePath);

    assert.equal(snapshot.totalCount, 1);
  });
});
