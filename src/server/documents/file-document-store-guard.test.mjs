#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const guardPath = path.join(__dirname, "file-document-store-guard.ts");

const ENV_KEYS = ["NODE_ENV", "ORIA_UNSAFE_ALLOW_FILE_DOCUMENT_STORE_IN_PROD"];
const SAVED = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function setEnv(k, v) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

test.after(() => {
  for (const k of ENV_KEYS) setEnv(k, SAVED[k]);
});

test("file document store guard", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@": path.join(projectRoot, "src") } });
  const { isFileDocumentStoreAllowed, UNSAFE_FILE_DOCUMENT_STORE_ENV } = await jiti.import(guardPath);

  await t.test("allowed outside production", () => {
    setEnv("NODE_ENV", "development");
    setEnv(UNSAFE_FILE_DOCUMENT_STORE_ENV, undefined);
    assert.equal(isFileDocumentStoreAllowed(), true);
  });

  await t.test("fail-closed in production without the unsafe opt-in", () => {
    setEnv("NODE_ENV", "production");
    setEnv(UNSAFE_FILE_DOCUMENT_STORE_ENV, undefined);
    assert.equal(isFileDocumentStoreAllowed(), false);
  });

  await t.test("allowed in production only with the explicit unsafe break-glass flag", () => {
    setEnv("NODE_ENV", "production");
    setEnv(UNSAFE_FILE_DOCUMENT_STORE_ENV, "true");
    assert.equal(isFileDocumentStoreAllowed(), true);
  });

  await t.test("any value other than \"true\" stays fail-closed in production", () => {
    setEnv("NODE_ENV", "production");
    setEnv(UNSAFE_FILE_DOCUMENT_STORE_ENV, "1");
    assert.equal(isFileDocumentStoreAllowed(), false);
  });
});
