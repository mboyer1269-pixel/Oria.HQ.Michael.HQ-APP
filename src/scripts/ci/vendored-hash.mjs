#!/usr/bin/env node
// Content hash of vendored (upstream, unmodified) skill packs. Any drift
// from src/scripts/ci/vendored-skills.lock.json fails rules-single-source.
// Usage: node src/scripts/ci/vendored-hash.mjs [--write]
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { governanceSubjectLines } from "./rules-scan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const VENDORED = [".agents/skills/supabase", ".agents/skills/supabase-postgres-best-practices"];
export function toPosixRel(root, file, p = path) {
  return p.relative(root, file).split(p.sep).join("/");
}

export const LOCK = path.join(root, "src/scripts/ci/vendored-skills.lock.json");

async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else out.push(p);
  }
  return out;
}

// Hash of one vendored pack from [{ rel, buf }] entries (rel = POSIX relative path).
// Sorted by POSIX rel and CRLF -> LF normalized, so Windows checkouts hash the same.
export function hashEntries(entries) {
  const h = createHash("sha256");
  let subjectLines = 0;
  const sorted = [...entries].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  for (const { rel, buf: raw } of sorted) {
    const buf = Buffer.from(raw.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
    h.update(`${rel}\0`).update(buf).update("\0");
    subjectLines += governanceSubjectLines(buf.toString("utf8"), rel).length;
  }
  return { sha256: h.digest("hex"), governanceSubjectLines: subjectLines };
}

export async function vendoredState() {
  const state = {};
  for (const dir of VENDORED) {
    const entries = [];
    for (const f of await files(path.join(root, dir))) {
      entries.push({ rel: toPosixRel(root, f), buf: await readFile(f) });
    }
    state[dir] = hashEntries(entries);
  }
  return state;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const state = await vendoredState();
  if (process.argv.includes("--write")) {
    // Keep the reviewed overlap notes; only the hashes are recomputed.
    let overlaps = [];
    try { overlaps = JSON.parse(await readFile(LOCK, "utf8")).overlaps ?? []; } catch {}
    await writeFile(LOCK, `${JSON.stringify({ ...state, overlaps }, null, 2)}\n`);
  }
  else process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}
