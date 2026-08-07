#!/usr/bin/env node

/**
 * Direct-dependency vulnerability gate.
 *
 * Fails when a package THIS repo declares in package.json carries a high or
 * critical advisory. Transitive advisories are reported and do not fail.
 *
 * Why the split, rather than gating on `npm audit` wholesale:
 *
 *   A blanket gate is unactionable here. Four of the current high advisories
 *   sit in packages nothing declares — opentelemetry pulled by inngest,
 *   brace-expansion and js-yaml pulled by tooling — and the only "fix" npm
 *   offers is a forced major upgrade of the parent. A gate that can only be
 *   satisfied by `npm audit fix --force` gets disabled the first week, and then
 *   it protects nothing. A gate on what we chose to install is one a human can
 *   always act on: bump it, replace it, or pin an override.
 *
 * Transitive high/critical advisories still print, with their path, so they are
 * visible rather than suppressed. They become failures the day a direct
 * dependency is added that carries them.
 *
 * Never run `npm audit fix --force` to satisfy this. It resolves advisories by
 * installing semver-major upgrades unattended, which is a much larger change
 * than the advisory it closes.
 *
 * Usage:
 *   node scripts/audit/direct-dependency-audit.mjs
 *   node scripts/audit/direct-dependency-audit.mjs --json
 */

import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * The ONLY npm invocation in this file, as a constant. `exec` runs it through a
 * shell — required on Windows, where npm is a .cmd — and there is nothing to
 * escape because no part of this string is derived from input.
 */
const AUDIT_COMMAND = "npm audit --json";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

async function readDeclaredDependencies() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
}

/**
 * `npm audit --json` exits non-zero whenever advisories exist, so a non-zero
 * status is expected and its stdout is the payload. Only an unparseable body is
 * a real failure — and it fails CLOSED, because "the audit did not run" must
 * never read the same as "nothing found".
 */
async function runAudit() {
  let stdout;
  try {
    ({ stdout } = await execAsync(AUDIT_COMMAND, {
      cwd: ROOT,
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (error) {
    stdout = error.stdout;
    if (!stdout) {
      throw new Error(`npm audit produced no output: ${error.message}`);
    }
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("npm audit output was not JSON — cannot verify dependencies.");
  }
}

function describeVia(via) {
  const titles = (via ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry.title))
    .filter(Boolean);
  return titles.length > 0 ? titles.join("; ") : "no advisory title";
}

async function main() {
  const asJson = process.argv.includes("--json");
  const declared = await readDeclaredDependencies();
  const audit = await runAudit();

  const blocking = [];
  const transitive = [];

  for (const [name, entry] of Object.entries(audit.vulnerabilities ?? {})) {
    if (!BLOCKING_SEVERITIES.has(entry.severity)) continue;

    // `isDirect` is npm's own answer, but it has been wrong across versions for
    // packages reached both directly and transitively. Cross-check against
    // package.json, which is the thing we actually control.
    const isDeclared = entry.isDirect === true || declared.has(name);
    const record = {
      name,
      severity: entry.severity,
      range: entry.range,
      title: describeVia(entry.via),
      fixAvailable: entry.fixAvailable,
    };
    (isDeclared ? blocking : transitive).push(record);
  }

  if (asJson) {
    console.log(JSON.stringify({ blocking, transitive }, null, 2));
  } else {
    const counts = audit.metadata?.vulnerabilities ?? {};
    console.log(
      `Dependency audit — ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
        `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low (all depths).`,
    );
    console.log("");

    if (transitive.length > 0) {
      console.log(`Transitive high/critical (reported, not blocking) — ${transitive.length}:`);
      for (const v of transitive) {
        console.log(`  ${v.name} [${v.severity}] ${v.range}`);
        console.log(`      ${v.title}`);
      }
      console.log("");
    }

    if (blocking.length === 0) {
      console.log("Direct dependencies: OK — no high or critical advisory in a declared package.");
    }
  }

  if (blocking.length > 0) {
    console.error(`Dependency audit: FAILED — ${blocking.length} declared package(s) affected:\n`);
    for (const v of blocking) {
      console.error(`  ${v.name} [${v.severity}]  vulnerable: ${v.range}`);
      console.error(`      ${v.title}`);
      const fix =
        v.fixAvailable && typeof v.fixAvailable === "object"
          ? `${v.fixAvailable.name}@${v.fixAvailable.version}` +
            (v.fixAvailable.isSemVerMajor ? " (SEMVER MAJOR — review before taking it)" : "")
          : v.fixAvailable
            ? "available"
            : "none published";
      console.error(`      fix: ${fix}\n`);
    }
    console.error(
      "Bump the declared version in package.json, replace the package, or pin a patched\n" +
        "version through `overrides`. Do NOT run `npm audit fix --force`: it takes\n" +
        "unattended semver-major upgrades to close an advisory.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Dependency audit could not run: ${err.message}`);
  process.exit(1);
});
