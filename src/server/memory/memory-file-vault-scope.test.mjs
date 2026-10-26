#!/usr/bin/env node
// Server-side isolation test for the file-backed memory vault:
// entries belonging to workspace B must never be returned for workspace A.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

async function loadModule() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  return jiti.import(path.join(__dirname, "memory-file-vault.ts"));
}

const entry = (workspace, title) =>
  `---\nworkspace: ${workspace}\ntype: note\ntitle: ${title}\n---\nBody of ${title}\n`;

test("file vault entries of workspace B are invisible from workspace A", async () => {
  const { loadFileVaultEntries } = await loadModule();
  const tmp = await mkdtemp(path.join(os.tmpdir(), "vault-scope-"));
  const prevCwd = process.cwd();
  try {
    await mkdir(path.join(tmp, "memory", "notes"), { recursive: true });
    await writeFile(path.join(tmp, "memory/notes/a.md"), entry("ws-a", "Alpha secret A"));
    await writeFile(path.join(tmp, "memory/notes/b.md"), entry("ws-b", "Bravo secret B"));
    process.chdir(tmp);

    const fromA = await loadFileVaultEntries("ws-a");
    const fromB = await loadFileVaultEntries("ws-b");

    assert.deepEqual(fromA.map((e) => e.title), ["Alpha secret A"]);
    assert.deepEqual(fromB.map((e) => e.title), ["Bravo secret B"]);
    assert.ok(!fromA.some((e) => e.body.includes("Bravo")), "B content leaked into A");
  } finally {
    process.chdir(prevCwd);
    await rm(tmp, { recursive: true, force: true });
  }
});

test("fail-closed: undeclared, empty or case-mismatched workspace is invisible to every workspace", async () => {
  const { loadFileVaultEntries } = await loadModule();
  const tmp = await mkdtemp(path.join(os.tmpdir(), "vault-scope-"));
  const prevCwd = process.cwd();
  const warnings = [];
  const prevWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    await mkdir(path.join(tmp, "memory", "notes"), { recursive: true });
    await writeFile(path.join(tmp, "memory/notes/a.md"), entry("ws-a", "Alpha ok"));
    await writeFile(path.join(tmp, "memory/notes/nofm.md"), "# No frontmatter title\nOrphan body\n");
    await writeFile(path.join(tmp, "memory/notes/nokey.md"), "---\ntype: note\ntitle: No key title\n---\nbody\n");
    await writeFile(path.join(tmp, "memory/notes/empty.md"), "---\nworkspace: \ntype: note\ntitle: Empty ws title\n---\nbody\n");
    await writeFile(path.join(tmp, "memory/notes/case.md"), entry("WS-A", "Case mismatch title"));
    process.chdir(tmp);

    const fromA = (await loadFileVaultEntries("ws-a")).map((e) => e.title);
    const fromB = (await loadFileVaultEntries("ws-b")).map((e) => e.title);
    assert.deepEqual(fromA, ["Alpha ok"]);
    assert.deepEqual(fromB, []);
    for (const name of ["nofm.md", "nokey.md", "empty.md"]) {
      assert.ok(warnings.some((w) => w.includes(name)), `missing warn for ${name}`);
    }
    for (const leak of ["Orphan body", "No frontmatter title", "No key title", "Empty ws title", "Case mismatch"]) {
      assert.ok(!warnings.some((w) => w.includes(leak)), `warn leaked content: ${leak}`);
    }
  } finally {
    console.warn = prevWarn;
    process.chdir(prevCwd);
    await rm(tmp, { recursive: true, force: true });
  }
});
