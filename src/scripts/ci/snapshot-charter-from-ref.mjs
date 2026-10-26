#!/usr/bin/env node
// Prints JSON.stringify(charterRegistry, null, 2) for charter-seed.ts as it
// exists at a git ref (default: origin/main), without checking it out.
// Usage: node src/scripts/ci/snapshot-charter-from-ref.mjs <ref> > snapshot.json
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ref = process.argv[2] ?? "origin/main";
const src = execFileSync("git", ["show", `${ref}:src/features/agents/charter-seed.ts`], { cwd: root, encoding: "utf8" });
const tmp = path.join(root, "src/features/agents/.charter-seed.snapshot-tmp.ts");
writeFileSync(tmp, src);
try {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, moduleCache: false });
  const { charterRegistry } = await jiti.import(tmp);
  process.stdout.write(`${JSON.stringify(charterRegistry, null, 2)}\n`);
} finally {
  rmSync(tmp, { force: true });
}
