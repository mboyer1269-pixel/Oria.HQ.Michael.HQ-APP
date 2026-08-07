#!/usr/bin/env node

/**
 * Direct-dependency vulnerability gate.
 *
 * Fails when a package this repo declares in package.json carries a high or
 * critical advisory. Transitive advisories are reported and do not fail.
 *
 * Why the split, rather than gating on `npm audit` wholesale: several current
 * high advisories sit in packages nothing declares, pulled by tooling, and the
 * only fix npm offers is a forced major upgrade of the parent. A gate that can
 * only be satisfied by `npm audit fix --force` gets disabled, and then it
 * protects nothing. A gate on what we chose to install is always actionable:
 * bump it, replace it, or pin an override.
 *
 * FAIL-CLOSED. "The audit did not run" must never read the same as "nothing
 * found", so the gate exits non-zero on every one of:
 *   - npm exiting non-zero for a reason other than "advisories exist"
 *   - stdout that is not JSON
 *   - a JSON body carrying an `error` (registry 403, offline, rate limited)
 *   - a body missing the fields a real audit always produces
 *   - a declared package with a high or critical advisory
 *
 * Never run `npm audit fix --force` to satisfy this: it resolves advisories by
 * installing semver-major upgrades unattended.
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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

/**
 * The ONLY npm invocation in this file, as a constant. `exec` runs it through a
 * shell — required on Windows, where npm is a .cmd — and nothing in this string
 * comes from input.
 */
const AUDIT_COMMAND = "npm audit --json";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

class AuditUnavailableError extends Error {}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readDeclaredDependencies() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
}

/**
 * `npm audit --json` exits non-zero whenever advisories exist, so a non-zero
 * status alone is not an error. It is an error when the body is not a real
 * audit result — which is exactly what a 403 or an offline registry produces.
 */
async function runAudit() {
  let stdout;
  let stderr;
  try {
    ({ stdout, stderr } = await execAsync(AUDIT_COMMAND, {
      cwd: ROOT,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    }));
  } catch (error) {
    stdout = error.stdout;
    stderr = error.stderr;
    if (!stdout || stdout.trim() === "") {
      throw new AuditUnavailableError(
        `npm audit produced no output (exit ${error.code ?? "?"}): ` +
          `${(stderr || error.message || "").trim().slice(0, 400)}`,
      );
    }
  }

  let body;
  try {
    body = JSON.parse(stdout);
  } catch {
    throw new AuditUnavailableError(
      "npm audit output was not JSON — the audit did not run:\n" + stdout.trim().slice(0, 400),
    );
  }

  // npm reports registry failures as a JSON body with an `error` object and
  // no advisory data. Accepting it silently reports "no vulnerabilities".
  if (isRecord(body) && body.error) {
    const { code, summary, detail } = body.error;
    throw new AuditUnavailableError(
      `npm audit returned an error payload (${code ?? "no code"}): ` +
        `${summary ?? detail ?? JSON.stringify(body.error).slice(0, 300)}`,
    );
  }

  // A real result always carries both of these, even with zero advisories.
  const hasVulnerabilities = isRecord(body) && isRecord(body.vulnerabilities);
  const hasMetadata =
    isRecord(body) && isRecord(body.metadata) && isRecord(body.metadata.vulnerabilities);

  if (!hasVulnerabilities || !hasMetadata) {
    throw new AuditUnavailableError(
      "npm audit output is missing the fields a real audit produces " +
        `(vulnerabilities: ${hasVulnerabilities}, metadata: ${hasMetadata}). ` +
        "Treating an incomplete result as clean would hide every advisory.",
    );
  }

  return body;
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

  for (const [name, entry] of Object.entries(audit.vulnerabilities)) {
    if (!BLOCKING_SEVERITIES.has(entry.severity)) continue;

    // npm's isDirect has been unreliable across versions for packages reached
    // both ways; package.json is the thing we control.
    const isDeclared = declared.has(name);
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
    const counts = audit.metadata.vulnerabilities;
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
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const label = err instanceof AuditUnavailableError ? "could not run" : "crashed";
  console.error(`Dependency audit ${label}: ${err.message}`);
  console.error("Failing closed: an audit that did not run is not a clean audit.");
  process.exitCode = 1;
});
