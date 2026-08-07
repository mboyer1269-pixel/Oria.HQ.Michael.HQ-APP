#!/usr/bin/env node

/**
 * Collects every environment variable this codebase reads.
 *
 * Uses the TypeScript compiler's own parser rather than regular expressions:
 * environment access takes several syntactic forms, and a pattern narrow enough
 * to avoid false positives misses most of them.
 *
 * Recognised forms:
 *   process.env.NAME                       property access
 *   process.env["NAME"]                    element access, string literal
 *   env.NAME / env["NAME"]                 the same on a parameter named env
 *   env[CONSTANT] / process.env[CONSTANT]  element access through a const whose
 *                                          initializer is a string literal
 *   const { NAME } = process.env           destructuring
 *
 * Constants are resolved across files: a module may export the name and another
 * may subscript with it.
 *
 * Usage:
 *   node scripts/audit/collect-env-references.mjs        # one name per line
 *   node scripts/audit/collect-env-references.mjs --json # {name: [files]}
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");

const toPosix = (p) => p.split(path.sep).join("/");
const isTest = (name) => /\.test\.(ts|tsx|mjs)$/.test(name);

/**
 * Names supplied by the runtime or the hosting platform, never set by an
 * operator, so they belong to neither the schema nor .env.example.
 */
export const INTRINSIC_ENV_NAMES = new Set([
  "NODE_ENV",
  "NEXT_PHASE",
  "PATH",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_REF",
]);

/** Looks like an environment variable name rather than any other constant. */
function looksLikeEnvName(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{2,}$/.test(value);
}

async function collectSourceFiles(dir = SRC, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name) && !isTest(entry.name)) acc.push(full);
  }
  return acc;
}

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
}

/** Every `const NAME = "STRING"` in a file, as a name -> value map. */
function collectStringConstants(sourceFile, into) {
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      into.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return into;
}

/** True when the expression denotes an environment bag (process.env, or `env`). */
function isEnvExpression(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      node.name.text === "env" &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process"
    );
  }
  return ts.isIdentifier(node) && node.text === "env";
}

function collectReferences(sourceFile, constants, record) {
  const visit = (node) => {
    // process.env.NAME  /  env.NAME
    if (ts.isPropertyAccessExpression(node) && isEnvExpression(node.expression)) {
      if (looksLikeEnvName(node.name.text)) record(node.name.text);
    }

    // process.env["NAME"]  /  env["NAME"]  /  env[CONSTANT]
    if (ts.isElementAccessExpression(node) && isEnvExpression(node.expression)) {
      const arg = node.argumentExpression;
      if (arg && ts.isStringLiteral(arg)) {
        if (looksLikeEnvName(arg.text)) record(arg.text);
      } else if (arg && ts.isIdentifier(arg)) {
        const resolved = constants.get(arg.text);
        if (looksLikeEnvName(resolved)) record(resolved);
      }
    }

    // const { NAME } = process.env
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isEnvExpression(node.initializer) &&
      node.name &&
      ts.isObjectBindingPattern(node.name)
    ) {
      for (const element of node.name.elements) {
        const source = element.propertyName ?? element.name;
        if (ts.isIdentifier(source) && looksLikeEnvName(source.text)) record(source.text);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/**
 * Returns a Map of env variable name -> repo-relative files that read it.
 * Intrinsic runtime names are excluded.
 */
export async function collectEnvReferences() {
  const files = await collectSourceFiles();
  const parsed = [];

  // Two passes: constants may be declared in one module and subscripted in
  // another, so every string constant is known before references are resolved.
  const constants = new Map();
  for (const file of files) {
    const sourceFile = parse(await readFile(file, "utf8"), file);
    parsed.push({ file, sourceFile });
    collectStringConstants(sourceFile, constants);
  }

  const references = new Map();
  for (const { file, sourceFile } of parsed) {
    const rel = toPosix(path.relative(ROOT, file));
    collectReferences(sourceFile, constants, (name) => {
      if (INTRINSIC_ENV_NAMES.has(name)) return;
      if (!references.has(name)) references.set(name, new Set());
      references.get(name).add(rel);
    });
  }

  return new Map([...references].map(([name, files]) => [name, [...files].sort()]));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("collect-env-references.mjs")) {
  const references = await collectEnvReferences();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(Object.fromEntries(references), null, 2));
  } else {
    for (const name of [...references.keys()].sort()) console.log(name);
  }
}
