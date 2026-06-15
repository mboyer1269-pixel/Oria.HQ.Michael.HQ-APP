#!/usr/bin/env node

// Fail-closed archive-dir resolution for the document CLI (offline, pure).
// No temp-dir fallback: refuses rather than relocate real files to purgeable
// storage. `env` is injected, so no process.env mutation and no side effects.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {});
const { resolveMclArchiveDir } = await jiti.import(path.join(__dirname, "mcl-archive-dir.ts"));

test("resolveMclArchiveDir", async (t) => {
  await t.test("throws (fail-closed) when MCL_ARCHIVE_DIR is unset", () => {
    assert.throws(() => resolveMclArchiveDir({}), /MCL_ARCHIVE_DIR is not set/);
  });

  await t.test("throws when MCL_ARCHIVE_DIR is blank", () => {
    assert.throws(() => resolveMclArchiveDir({ MCL_ARCHIVE_DIR: "   " }), /MCL_ARCHIVE_DIR is not set/);
  });

  await t.test("resolves to an absolute path when configured", () => {
    const input = "archive/mcl";
    const out = resolveMclArchiveDir({ MCL_ARCHIVE_DIR: input });
    assert.equal(out, path.resolve(input));
    assert.equal(path.isAbsolute(out), true);
  });

  await t.test("never falls back to a temp directory", () => {
    // Without the env var it must throw, never silently pick os.tmpdir().
    let result;
    try {
      result = resolveMclArchiveDir({});
    } catch {
      result = "threw";
    }
    assert.equal(result, "threw");
  });
});
