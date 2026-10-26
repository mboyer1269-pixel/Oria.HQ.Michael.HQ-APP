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

test("frontmatter parsing: empty workspace cannot swallow the next line; duplicates and bad slugs rejected", async () => {
  const { classifyFileEntryWorkspace, fileEntryWorkspaceId } = await loadModule();
  const swallow = "---\nworkspace: \ntitle: t\n---\nbody\n";
  assert.notEqual(fileEntryWorkspaceId(swallow), "title: t");
  assert.equal(fileEntryWorkspaceId(swallow), null);
  assert.equal(classifyFileEntryWorkspace(swallow).status, "empty");
  assert.equal(classifyFileEntryWorkspace("---\nworkspace: ws-a\nworkspace: ws-b\ntitle: t\n---\n").status, "duplicate");
  assert.equal(classifyFileEntryWorkspace("---\nworkspace: ws a!\ntitle: t\n---\n").status, "invalid");
  assert.equal(classifyFileEntryWorkspace("---\nworkspace: WS-A\ntitle: t\n---\n").status, "invalid");
  assert.equal(classifyFileEntryWorkspace("# no frontmatter\n").status, "missing");
  assert.deepEqual(classifyFileEntryWorkspace("---\nworkspace: michael-hq\ntitle: t\n---\n"), { status: "declared", workspaceId: "michael-hq" });
});

test("loadScopedFileVault exposes the excluded count and the page notice shows it (count only)", async () => {
  const { loadScopedFileVault } = await loadModule();
  const { createJiti } = await import("jiti");
  const { excludedFilesNotice } = await createJiti(import.meta.url).import(path.join(__dirname, "memory-vault-notice.ts"));
  const tmp = await mkdtemp(path.join(os.tmpdir(), "vault-scope-"));
  const prevCwd = process.cwd();
  const prevWarn = console.warn;
  console.warn = () => {};
  try {
    await mkdir(path.join(tmp, "memory", "notes"), { recursive: true });
    await writeFile(path.join(tmp, "memory/notes/a.md"), entry("ws-a", "Alpha ok"));
    await writeFile(path.join(tmp, "memory/notes/b.md"), entry("ws-b", "Bravo ok"));
    await writeFile(path.join(tmp, "memory/notes/nofm.md"), "# Secret orphan\nbody\n");
    await writeFile(path.join(tmp, "memory/notes/empty.md"), "---\nworkspace: \ntitle: Secret empty\n---\n");
    await writeFile(path.join(tmp, "memory/notes/dup.md"), "---\nworkspace: ws-a\nworkspace: ws-b\ntitle: Secret dup\n---\n");
    process.chdir(tmp);

    const scoped = await loadScopedFileVault("ws-a");
    assert.deepEqual(scoped.entries.map((e) => e.title), ["Alpha ok"]);
    assert.equal(scoped.excludedCount, 3);
    const notice = excludedFilesNotice(scoped.excludedCount);
    assert.equal(notice, "3 fichiers exclus, sans espace déclaré");
    assert.ok(!/Secret/.test(notice));
    assert.equal(excludedFilesNotice(0), null);
  } finally {
    console.warn = prevWarn;
    process.chdir(prevCwd);
    await rm(tmp, { recursive: true, force: true });
  }
});
