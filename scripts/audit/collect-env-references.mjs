#!/usr/bin/env node

/**
 * Collects every environment variable this codebase reads.
 *
 * Uses the TypeScript compiler's parser rather than regular expressions:
 * environment access takes several syntactic forms, and a pattern narrow enough
 * to avoid false positives misses most of them.
 *
 * Resolution model
 * ----------------
 * Identifiers resolve through a scope chain, then through imports, then through
 * module-level bindings of the importing file. A single flat name -> value map
 * would let a local `const KEY = "SOMETHING_ELSE"` in one file answer a lookup
 * in another.
 *
 * An environment bag is recognised by what it IS, not by being called `env`:
 *   - `process.env`
 *   - any binding initialised from `process.env` (`const e = process.env`)
 *   - any parameter or variable annotated `NodeJS.ProcessEnv`
 *
 * Recognised reads:
 *   bag.NAME                       property access
 *   bag["NAME"]                    element access, string literal
 *   bag[CONSTANT]                  element access through a resolvable binding
 *   bag[k] where k iterates a
 *     constant array of literals   for…of over a literal list
 *   const { NAME } = bag           destructuring
 *   { key: "NAME" } descriptors    env requirement objects in a file that also
 *                                  reads an environment bag
 *
 * Anything subscripted with an expression that cannot be resolved is NOT
 * silently dropped: it is returned in `dynamicReads` so a caller can require
 * each one to be acknowledged.
 *
 * Usage:
 *   node scripts/audit/collect-env-references.mjs        # one name per line
 *   node scripts/audit/collect-env-references.mjs --json # full result
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");

const toPosix = (p) => p.split(path.sep).join("/");
const isTest = (name) => /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(name);

/**
 * Names supplied by the runtime or the hosting platform, never set by an
 * operator, so they belong to neither the schema nor .env.example.
 */
export const INTRINSIC_ENV_NAMES = new Set([
  "NODE_ENV",
  "NEXT_PHASE",
  "PATH",
  // Hosting-platform markers. The code probes them to detect where it runs; an
  // operator never sets them, so they are not configuration.
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_REF",
  "AWS_LAMBDA_FUNCTION_NAME",
  "LAMBDA_TASK_ROOT",
  "K_SERVICE",
  "FLY_APP_NAME",
  "RENDER",
  "GITHUB_ACTIONS",
]);

/** Property names that carry an environment variable name in a descriptor object. */
const DESCRIPTOR_KEY_NAMES = new Set(["key", "envKey", "envVar", "variable"]);

/** Array methods whose callback receives one element of the array. */
const ITERATING_METHODS = new Set([
  "find",
  "findIndex",
  "some",
  "every",
  "filter",
  "map",
  "flatMap",
  "forEach",
]);

/** Looks like an environment variable name rather than any other constant. */
function looksLikeEnvName(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{2,}$/.test(value);
}

async function collectSourceFiles(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(full, acc);
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name) && !isTest(entry.name)) acc.push(full);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

function findScope(start, predicate) {
  for (let scope = start; scope; scope = scope.parent) {
    if (predicate(scope)) return scope;
  }
  return undefined;
}

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    /** name -> string value */
    this.strings = new Map();
    /** name -> string[] (constant array of literals) */
    this.lists = new Map();
    /** names bound to an environment bag */
    this.envBags = new Set();
  }
  lookupString(name) {
    return findScope(this, (scope) => scope.strings.has(name))?.strings.get(name);
  }
  lookupList(name) {
    return findScope(this, (scope) => scope.lists.has(name))?.lists.get(name);
  }
  isEnvBag(name) {
    return findScope(this, (scope) => scope.envBags.has(name)) !== undefined;
  }
}

const introducesScope = (node) =>
  ts.isSourceFile(node) ||
  ts.isBlock(node) ||
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isForStatement(node) ||
  ts.isForOfStatement(node) ||
  ts.isForInStatement(node) ||
  ts.isCaseBlock(node) ||
  ts.isModuleBlock(node);

/** `process.env` itself. */
function isProcessEnv(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "env" &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process"
  );
}

/**
 * A type annotation that denotes an environment bag.
 *
 * Two shapes, because this codebase uses both: the Node type itself, and the
 * structural alias `Record<string, string | undefined>` (optionally wrapped in
 * Readonly) that modules take when they want an injectable env for tests.
 * Keying on the parameter NAME instead would miss every one of them.
 */
function isProcessEnvType(typeNode) {
  if (!typeNode) return false;
  const text = (typeNode.getText?.() ?? "").replace(/\s+/g, " ");
  if (/\bProcessEnv\b/.test(text)) return true;
  return /Record<\s*string\s*,\s*string\s*\|\s*undefined\s*>/.test(text);
}

/** An array literal of string literals, or undefined. */
function literalStringArray(node) {
  if (!node || !ts.isArrayLiteralExpression(node)) return undefined;
  const values = [];
  for (const element of node.elements) {
    if (!ts.isStringLiteral(element)) return undefined;
    values.push(element.text);
  }
  return values;
}

// ---------------------------------------------------------------------------
// Per-file analysis
// ---------------------------------------------------------------------------

/**
 * Module-level string constants a file EXPORTS, for cross-file resolution.
 * Only exported bindings are visible to importers.
 */
function collectModuleStrings(sourceFile, exportedOnly = false) {
  const strings = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const isExported = statement.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (exportedOnly && !isExported) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        ts.isStringLiteral(declaration.initializer)
      ) {
        strings.set(declaration.name.text, declaration.initializer.text);
      }
    }
  }
  return strings;
}

/** Resolves a relative import specifier or the `@/` alias to a repo file path. */
function resolveImport(fromFile, specifier, byPath, root, src) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(src, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return undefined;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
    path.join(base, "index.mjs"),
    path.join(base, "index.cjs"),
  ]) {
    const rel = toPosix(path.relative(root, candidate));
    if (byPath.has(rel)) return rel;
  }
  return undefined;
}

/** Imported name -> {file, exportedName} for a file. */
function collectImports(sourceFile, filePath, byPath, root, src) {
  const imports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const target = resolveImport(filePath, statement.moduleSpecifier.text, byPath, root, src);
    if (!target) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      imports.set(element.name.text, {
        file: target,
        exportedName: (element.propertyName ?? element.name).text,
      });
    }
  }
  return imports;
}

function analyseFile({ sourceFile, filePath, root, imports, exportedByFile, record, recordDynamic }) {
  const rel = toPosix(path.relative(root, filePath));

  /** Resolves an identifier to a string, through scope then imports. */
  const resolveString = (scope, name) => {
    const local = scope.lookupString(name);
    if (local !== undefined) return local;
    const imported = imports.get(name);
    if (!imported) return undefined;
    return exportedByFile.get(imported.file)?.get(imported.exportedName);
  };

  /** True when this expression denotes an environment bag. */
  const isEnvBag = (scope, node) =>
    isProcessEnv(node) || (ts.isIdentifier(node) && scope.isEnvBag(node.text));

  // A descriptor list only counts in a file that actually reads an env bag,
  // so a `key: "SOME_STRING"` elsewhere is never mistaken for a variable.
  let readsEnvBag = false;
  const descriptorCandidates = [];
  /** Callback node -> {name, list} bound by an iterating array method. */
  const callbackBags = new Map();

  const visit = (node, scope) => {
    const current = introducesScope(node) ? new Scope(scope) : scope;

    // Bindings: strings, literal arrays, env bags.
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        current.strings.set(name, node.initializer.text);
      }
      const list = literalStringArray(node.initializer);
      if (list) current.lists.set(name, list);
      if (
        (node.initializer && isEnvBag(current, node.initializer)) ||
        isProcessEnvType(node.type)
      ) {
        current.envBags.add(name);
      }
    }

    // Parameters that are an environment bag: annotated as one, or defaulted
    // to process.env. The default is the strongest signal and needs no type.
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      if (
        isProcessEnvType(node.type) ||
        (node.initializer && isEnvBag(current, node.initializer))
      ) {
        // `current` is the function's own scope; its body inherits this binding
        // through the parent chain.
        current.envBags.add(node.name.text);
      }
    }

    // LIST.find(k => … env[k] …) — bind the callback parameter to every
    // literal. The array-method form is as common as for…of for iterating a
    // constant key list, and dropping it leaves the reads unresolved.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ITERATING_METHODS.has(node.expression.name.text)
    ) {
      const target = node.expression.expression;
      const list =
        literalStringArray(target) ??
        (ts.isIdentifier(target) ? current.lookupList(target.text) : undefined);
      const callback = node.arguments[0];
      if (
        list &&
        callback &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
        callback.parameters.length > 0 &&
        ts.isIdentifier(callback.parameters[0].name)
      ) {
        callbackBags.set(callback, { name: callback.parameters[0].name.text, list });
      }
    }

    // A callback body inherits the key list bound by its first parameter.
    const callbackBinding = callbackBags.get(node);
    if (callbackBinding) current.lists.set(callbackBinding.name, callbackBinding.list);

    // for (const k of LIST) — bind the loop variable to every literal.
    if (ts.isForOfStatement(node)) {
      const list =
        literalStringArray(node.expression) ??
        (ts.isIdentifier(node.expression) ? current.lookupList(node.expression.text) : undefined);
      if (
        list &&
        ts.isVariableDeclarationList(node.initializer) &&
        node.initializer.declarations.length === 1
      ) {
        const binding = node.initializer.declarations[0].name;
        if (ts.isIdentifier(binding)) current.lists.set(binding.text, list);
      }
    }

    // bag.NAME
    if (ts.isPropertyAccessExpression(node) && isEnvBag(current, node.expression)) {
      readsEnvBag = true;
      if (looksLikeEnvName(node.name.text)) record(node.name.text, rel);
    }

    // bag["NAME"] / bag[CONSTANT] / bag[loopVar]
    if (ts.isElementAccessExpression(node) && isEnvBag(current, node.expression)) {
      readsEnvBag = true;
      const arg = node.argumentExpression;
      if (arg && ts.isStringLiteral(arg)) {
        if (looksLikeEnvName(arg.text)) record(arg.text, rel);
      } else if (arg && ts.isIdentifier(arg)) {
        const asString = resolveString(current, arg.text);
        const asList = current.lookupList(arg.text);
        if (looksLikeEnvName(asString)) {
          record(asString, rel);
        } else if (asList) {
          for (const value of asList) if (looksLikeEnvName(value)) record(value, rel);
        } else {
          recordDynamic(rel, arg.text);
        }
      } else if (arg) {
        recordDynamic(rel, arg.getText());
      }
    }

    // const { NAME } = bag
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isEnvBag(current, node.initializer) &&
      node.name &&
      ts.isObjectBindingPattern(node.name)
    ) {
      readsEnvBag = true;
      for (const element of node.name.elements) {
        const source = element.propertyName ?? element.name;
        if (ts.isIdentifier(source) && looksLikeEnvName(source.text)) record(source.text, rel);
      }
    }

    // { key: "NAME", … } — an env requirement descriptor.
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      DESCRIPTOR_KEY_NAMES.has(node.name.text) &&
      ts.isStringLiteral(node.initializer) &&
      looksLikeEnvName(node.initializer.text)
    ) {
      descriptorCandidates.push(node.initializer.text);
    }

    ts.forEachChild(node, (child) => visit(child, current));
  };

  // Module constants are collected before traversal so a subscript is not
  // classified as dynamic merely because its declaration appears later.
  const rootScope = new Scope(null);
  rootScope.strings = collectModuleStrings(sourceFile);
  visit(sourceFile, rootScope);

  if (readsEnvBag) {
    for (const name of descriptorCandidates) record(name, rel);
  }
}

/**
 * Returns:
 *   references   Map<name, files[]> — variables the code reads.
 *   dynamicReads Array<{file, expression}> — subscripts that could not resolve.
 *
 * Intrinsic runtime names are excluded from `references`.
 */
export async function collectEnvReferences(options = {}) {
  // Root and source directory are injectable so fixtures can live outside the
  // repository tree. Writing them under src/ would put them in front of every
  // other suite that walks src/, and `node --test` runs files in parallel.
  const root = options.root ?? ROOT;
  const src = options.src ?? (options.root ? path.join(options.root, "src") : SRC);

  const files = await collectSourceFiles(src);

  const parsed = [];
  const byPath = new Set();
  for (const file of files) byPath.add(toPosix(path.relative(root, file)));

  for (const file of files) {
    const sourceFile = ts.createSourceFile(
      file,
      await readFile(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    parsed.push({ file, sourceFile });
  }

  // Exported string constants per file, for cross-file identifier resolution.
  const exportedByFile = new Map();
  for (const { file, sourceFile } of parsed) {
    exportedByFile.set(
      toPosix(path.relative(root, file)),
      collectModuleStrings(sourceFile, true),
    );
  }

  const references = new Map();
  const dynamicReads = [];

  const record = (name, file) => {
    if (INTRINSIC_ENV_NAMES.has(name)) return;
    if (!references.has(name)) references.set(name, new Set());
    references.get(name).add(file);
  };
  const recordDynamic = (file, expression) => {
    dynamicReads.push({ file, expression });
  };

  for (const { file, sourceFile } of parsed) {
    analyseFile({
      sourceFile,
      filePath: file,
      root,
      imports: collectImports(sourceFile, file, byPath, root, src),
      exportedByFile,
      record,
      recordDynamic,
    });
  }

  return {
    references: new Map([...references].map(([name, set]) => [name, [...set].sort()])),
    dynamicReads,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { references, dynamicReads } = await collectEnvReferences();
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify({ references: Object.fromEntries(references), dynamicReads }, null, 2),
    );
  } else {
    for (const name of [...references.keys()].sort()) console.log(name);
    if (dynamicReads.length > 0) {
      console.log("\nUnresolved dynamic reads:");
      for (const read of dynamicReads) console.log(`  ${read.file}: env[${read.expression}]`);
    }
  }
}
