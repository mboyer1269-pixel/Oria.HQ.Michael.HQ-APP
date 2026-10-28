import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashEntries } from "./vendored-hash.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const lf = Buffer.from("# Title\nline one\nline two\n");
const crlf = Buffer.from("# Title\r\nline one\r\nline two\r\n");

test("a CRLF copy of a vendored file hashes the same as the LF original", () => {
  assert.deepEqual(hashEntries([{ rel: "a/x.md", buf: crlf }]), hashEntries([{ rel: "a/x.md", buf: lf }]));
});

test("hash order follows the POSIX relative path, not input/native order", () => {
  const a = { rel: "a/b.md", buf: Buffer.from("b\n") };
  const b = { rel: "a/c.md", buf: Buffer.from("c\n") };
  assert.deepEqual(hashEntries([b, a]), hashEntries([a, b]));
});

test("no raw path.relative( in src/scripts/ci/*.mjs outside toPosixRel", async () => {
  const hits = [];
  for (const name of (await readdir(here)).filter((n) => n.endsWith(".mjs") && n !== path.basename(fileURLToPath(import.meta.url)))) {
    const lines = (await readFile(path.join(here, name), "utf8")).split(/\r?\n/);
    lines.forEach((l, i) => {
      if (/\bpath\.relative\(/.test(l)) hits.push(`${name}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], `use toPosixRel(root, file) instead of path.relative():\n${hits.join("\n")}`);
});
