#!/usr/bin/env node
// Generates src/features/agents/core-rule-labels.generated.ts from the
// "Agent-facing labels (fr)" section of .agents/rules/core.md.
// Usage: node src/scripts/ci/generate-rule-labels.mjs [--check]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const CORE = path.join(root, ".agents/rules/core.md");
export const OUT = path.join(root, "src/features/agents/core-rule-labels.generated.ts");
const LABEL = /^- `(R-[A-Z0-9-]+#[a-z0-9-]+)` — (.+)$/gm;

export function parseLabels(core) {
  return Object.fromEntries([...core.matchAll(LABEL)].map((m) => [m[1], m[2].trim()]));
}

export function render(labels) {
  const body = Object.entries(labels)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");
  return `// GENERATED from .agents/rules/core.md (section "Agent-facing labels (fr)").
// Do not edit: run \`node src/scripts/ci/generate-rule-labels.mjs\`.

export const CORE_RULE_LABELS = {
${body}
} as const;

export type CoreRuleLabelKey = keyof typeof CORE_RULE_LABELS;

/** Agent-facing text of a core.md rule label, cited by id. */
export function ruleLabel(key: CoreRuleLabelKey): string {
  return CORE_RULE_LABELS[key];
}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = render(parseLabels(await readFile(CORE, "utf8")));
  if (process.argv.includes("--check")) {
    if ((await readFile(OUT, "utf8")) !== out) {
      console.error("core-rule-labels.generated.ts is stale");
      process.exit(1);
    }
  } else {
    await writeFile(OUT, out);
  }
}
