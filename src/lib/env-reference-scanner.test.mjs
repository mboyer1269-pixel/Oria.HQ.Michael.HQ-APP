#!/usr/bin/env node

// src/lib/env-reference-scanner.test.mjs
//
// Covers scripts/audit/collect-env-references.mjs, which decides what "the
// schema is complete" means. Each syntactic form it claims to understand is
// proved against a fixture, and each form it must NOT match is proved too: a
// scanner that silently stops recognising a form turns the completeness guard
// into a guard over nothing.

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const { collectEnvReferences } = await import(
  pathToFileURL(path.join(projectRoot, "scripts/audit/collect-env-references.mjs")).href
);

/**
 * Writes fixture files into a throwaway root and scans THAT root.
 *
 * Deliberately outside the repository tree: `node --test` runs files in
 * parallel, and fixtures under src/ would appear to every other suite that
 * walks src/ — the inventory completeness check among them.
 */
async function scanWithFixtures(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "env-scanner-"));
  const src = path.join(root, "src");
  try {
    await mkdir(src, { recursive: true });
    for (const [name, contents] of Object.entries(files)) {
      await writeFile(path.join(src, name), contents, "utf8");
    }
    const { references, dynamicReads } = await collectEnvReferences({ root, src });
    return { names: new Set(references.keys()), references, dynamicReads };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("Env scanner — every form it claims to resolve", async (t) => {
  await t.test("direct property access", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `export const v = process.env.FIXTURE_DIRECT_ONE;`,
    });
    assert.ok(names.has("FIXTURE_DIRECT_ONE"));
  });

  await t.test("subscript with a string literal", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `export const v = process.env["FIXTURE_LITERAL_TWO"];`,
    });
    assert.ok(names.has("FIXTURE_LITERAL_TWO"));
  });

  await t.test("subscript through a local constant", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `const KEY = "FIXTURE_LOCAL_CONST";\nexport const v = process.env[KEY];`,
    });
    assert.ok(names.has("FIXTURE_LOCAL_CONST"));
  });

  await t.test("subscript through a module constant declared later", async () => {
    const { names, dynamicReads } = await scanWithFixtures({
      "a.ts": `export const v = process.env[KEY];\nconst KEY = "FIXTURE_LATER_CONST";`,
    });
    assert.ok(names.has("FIXTURE_LATER_CONST"));
    assert.deepEqual(dynamicReads, []);
  });

  await t.test("subscript through a constant imported from another module", async () => {
    const { names } = await scanWithFixtures({
      "names.ts": `export const REMOTE_KEY = "FIXTURE_CROSS_MODULE";`,
      "reader.ts": `import { REMOTE_KEY } from "./names";\nexport const v = process.env[REMOTE_KEY];`,
    });
    assert.ok(
      names.has("FIXTURE_CROSS_MODULE"),
      "a constant declared in one module and subscripted in another must resolve",
    );
  });

  await t.test("destructuring an environment bag", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `const { FIXTURE_DESTRUCTURED } = process.env;\nexport const v = FIXTURE_DESTRUCTURED;`,
    });
    assert.ok(names.has("FIXTURE_DESTRUCTURED"));
  });

  await t.test("a bag aliased by assignment, not by being named env", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `const settings = process.env;\nexport const v = settings.FIXTURE_ALIAS_ASSIGNED;`,
    });
    assert.ok(
      names.has("FIXTURE_ALIAS_ASSIGNED"),
      "an alias bound to process.env must be recognised whatever it is called",
    );
  });

  await t.test("a bag typed as a ProcessEnv record, under any parameter name", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `export function read(config: Readonly<Record<string, string | undefined>>) {\n  return config.FIXTURE_TYPED_PARAM;\n}`,
    });
    assert.ok(
      names.has("FIXTURE_TYPED_PARAM"),
      "the structural ProcessEnv alias must be recognised on a parameter not called env",
    );
  });

  await t.test("a bag parameter defaulted to process.env", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `export function read(bag = process.env) {\n  return bag.FIXTURE_DEFAULTED_PARAM;\n}`,
    });
    assert.ok(names.has("FIXTURE_DEFAULTED_PARAM"));
  });

  await t.test("keys iterated from a constant list with for…of", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `const KEYS = ["FIXTURE_FOROF_A", "FIXTURE_FOROF_B"];\nexport function read() {\n  for (const k of KEYS) { if (process.env[k]) return k; }\n  return null;\n}`,
    });
    assert.ok(names.has("FIXTURE_FOROF_A"));
    assert.ok(names.has("FIXTURE_FOROF_B"));
  });

  await t.test("keys iterated from a constant list with an array method", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `const MARKERS = ["FIXTURE_FIND_A", "FIXTURE_FIND_B"];\nexport function read(env: Readonly<Record<string, string | undefined>>) {\n  return MARKERS.find((key) => typeof env[key] === "string");\n}`,
    });
    assert.ok(
      names.has("FIXTURE_FIND_A") && names.has("FIXTURE_FIND_B"),
      "a callback parameter iterating a constant list must resolve to every literal",
    );
  });

  await t.test("an env requirement descriptor in a file that reads a bag", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `const reqs = [{ key: "FIXTURE_DESCRIPTOR", required: true }];\nexport function read() {\n  return reqs.map((r) => process.env[r.key]);\n}`,
    });
    assert.ok(names.has("FIXTURE_DESCRIPTOR"));
  });
});

test("Env scanner — what it must NOT match", async (t) => {
  await t.test("a constant that merely looks like an env name", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `export const FIXTURE_NEGATIVE_PLAIN = "FIXTURE_NEGATIVE_VALUE";`,
    });
    assert.ok(!names.has("FIXTURE_NEGATIVE_VALUE"), "a plain string constant is not an env read");
    assert.ok(!names.has("FIXTURE_NEGATIVE_PLAIN"));
  });

  await t.test("a property on an object that is not an environment bag", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `const settings = { FIXTURE_NEGATIVE_OBJECT: 1 };\nexport const v = settings.FIXTURE_NEGATIVE_OBJECT;`,
    });
    assert.ok(!names.has("FIXTURE_NEGATIVE_OBJECT"));
  });

  await t.test("a descriptor in a file that never reads a bag", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `export const rows = [{ key: "FIXTURE_NEGATIVE_DESCRIPTOR", label: "x" }];`,
    });
    assert.ok(
      !names.has("FIXTURE_NEGATIVE_DESCRIPTOR"),
      "a `key:` property is only an env name where the file also reads an environment bag",
    );
  });

  await t.test("a same-named constant in another module does not leak", async () => {
    // The defect a flat name -> value map produces: one file's local constant
    // answering another file's lookup.
    const { references } = await scanWithFixtures({
      "other.ts": `const SHARED_NAME = "FIXTURE_LEAK_WRONG";\nexport const x = SHARED_NAME;`,
      "reader.ts": `const SHARED_NAME = "FIXTURE_LEAK_RIGHT";\nexport const v = process.env[SHARED_NAME];`,
    });
    assert.ok(references.has("FIXTURE_LEAK_RIGHT"));
    assert.ok(
      !references.has("FIXTURE_LEAK_WRONG"),
      "a constant from an unrelated module resolved a subscript it never reaches",
    );
  });

  await t.test("test files are not scanned", async () => {
    const { names } = await scanWithFixtures({
      "a.test.ts": `export const v = process.env.FIXTURE_IN_A_TEST;`,
    });
    assert.ok(!names.has("FIXTURE_IN_A_TEST"));
  });

  await t.test("hosting-platform markers are not configuration", async () => {
    const { names } = await scanWithFixtures({
      "a.ts": `export const v = process.env.VERCEL_ENV ?? process.env.RENDER;`,
    });
    assert.ok(!names.has("VERCEL_ENV"));
    assert.ok(!names.has("RENDER"));
  });
});

test("Env scanner — unresolvable subscripts are reported, never dropped", async (t) => {
  await t.test("a subscript it cannot resolve appears in dynamicReads", async () => {
    const { dynamicReads } = await scanWithFixtures({
      "a.ts": `export function read(k: string) {\n  return process.env[k];\n}`,
    });
    assert.deepEqual(
      dynamicReads.map((entry) => `${entry.file}:${entry.expression}`),
      ["src/a.ts:k"],
      "an unresolvable subscript must be reported so it can be acknowledged",
    );
  });

  await t.test("the production tree's unresolvable reads are the known ones", async () => {
    // Each is a genuine runtime lookup, not a missing declaration:
    //   check-supabase-config enumerates process.env rather than depending on names;
    //   webhook-registry subscripts a binding field whose value is a declared constant.
    const { dynamicReads } = await collectEnvReferences();
    const counts = new Map();
    for (const { file, expression } of dynamicReads) {
      const key = JSON.stringify([file, expression]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const actual = [...counts]
      .map(([key, count]) => {
        const [file, expression] = JSON.parse(key);
        return { file, expression, count };
      })
      .sort((a, b) => `${a.file}:${a.expression}`.localeCompare(`${b.file}:${b.expression}`));
    assert.deepEqual(
      actual,
      [
        { file: "src/scripts/check-supabase-config.ts", expression: "key", count: 1 },
        {
          file: "src/server/runtime/webhook-registry.ts",
          expression: "binding.destinationEnvKey",
          count: 2,
        },
      ],
      "a new unresolvable environment subscript appeared. Resolve it in the scanner, or " +
        "acknowledge its exact file, expression, and count here.",
    );
  });
});
