#!/usr/bin/env node

// src/lib/server-env.test.mjs
//
// The environment schema is the contract between a deployment and this app.
// When it is incomplete the failure is the worst kind: the app boots, reports
// nothing wrong, and refuses every request.
//
// These tests assert three things: the fail-fast covers what authentication
// actually needs, the schema is the complete inventory of what the code reads —
// including variables reached through a name constant — and .env.example does
// not disagree with the schema.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const read = (relPath) => readFile(path.join(projectRoot, relPath), "utf8");

// pathToFileURL: on Windows a bare absolute path is not a valid ESM specifier.
const { collectEnvReferences } = await import(
  pathToFileURL(path.join(projectRoot, "scripts/audit/collect-env-references.mjs")).href
);

/**
 * Loads server-env in a CHILD process with a chosen environment.
 *
 * The module fail-fasts at import time, so the check cannot be exercised
 * in-process: the first import wins for the lifetime of this one.
 */
function loadServerEnvWith(env) {
  const script = `
    (async () => {
      const { createJiti } = await import("jiti");
      const jiti = createJiti(${JSON.stringify(path.join(projectRoot, "probe.mjs"))}, {
        alias: {
          "@": ${JSON.stringify(path.join(projectRoot, "src"))},
          "server-only": ${JSON.stringify(path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"))},
        },
      });
      try {
        await jiti.import(${JSON.stringify(path.join(projectRoot, "src/lib/server-env.ts"))});
        console.log(JSON.stringify({ ok: true }));
      } catch (err) {
        console.log(JSON.stringify({ ok: false, message: String(err && err.message) }));
      }
    })();
  `;
  const out = execFileSync(process.execPath, ["-e", script], {
    env: { ...env, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").pop());
}

const PRODUCTION_BASE = {
  NODE_ENV: "production",
  ANTHROPIC_API_KEY: "k",
  MICHAEL_HQ_OWNER_ID: "owner-id",
  MICHAEL_HQ_OWNER_EMAIL: "owner@example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

test("Production fail-fast — it covers what authentication actually needs", async (t) => {
  await t.test("a complete production environment boots", () => {
    const result = loadServerEnvWith(PRODUCTION_BASE);
    assert.equal(result.ok, true, `expected a clean boot, got: ${result.message}`);
  });

  await t.test("a missing anon key stops the boot instead of breaking every route", () => {
    const env = { ...PRODUCTION_BASE };
    delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const result = loadServerEnvWith(env);
    assert.equal(
      result.ok,
      false,
      "production booted without NEXT_PUBLIC_SUPABASE_ANON_KEY — the owner gate " +
        "would answer 401 on every request with nothing explaining why",
    );
    assert.match(result.message, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  await t.test("the other critical variables still stop the boot", () => {
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "MICHAEL_HQ_OWNER_ID",
      "MICHAEL_HQ_OWNER_EMAIL",
    ]) {
      const env = { ...PRODUCTION_BASE };
      delete env[key];
      const result = loadServerEnvWith(env);
      assert.equal(result.ok, false, `production booted without ${key}`);
      assert.match(result.message, new RegExp(key));
    }
  });

  await t.test("a missing scheduled-jobs key does NOT stop the boot", async () => {
    // Deliberate asymmetry: Inngest's absence degrades one rail, and turning
    // that into a boot failure would take the whole app down to protect a
    // subsystem that is currently frozen.
    const result = loadServerEnvWith(PRODUCTION_BASE);
    assert.equal(result.ok, true);

    const source = await read("src/lib/server-env.ts");
    const criticalBlock = source.slice(
      source.indexOf("const criticalMissing"),
      source.indexOf("Public serverEnv object"),
    );
    assert.ok(
      !criticalBlock.includes("INNGEST"),
      "Inngest became boot-critical — that is a deliberate decision, not a drift fix",
    );
  });

  await t.test("outside production nothing is required", () => {
    const result = loadServerEnvWith({ NODE_ENV: "development" });
    assert.equal(result.ok, true, `local dev must run with no configuration: ${result.message}`);
  });
});

test("Production readiness warnings reach an observable surface", async (t) => {
  await t.test("they are emitted at module load, not merely returned", async () => {
    const source = await read("src/lib/server-env.ts");
    assert.match(source, /for \(const warning of getProductionReadinessWarnings\(\)\)/);
    assert.match(source, /console\.warn/);
  });

  await t.test("the health endpoint exposes them with a code and a subsystem", async () => {
    const route = await read("src/app/api/health/route.ts");
    assert.match(route, /getProductionReadinessWarnings/);
    assert.match(route, /degraded/);
    assert.match(route, /subsystem/);
  });

  await t.test("a degraded production is reported by the endpoint", async () => {
    // Behavioural: run the real route handler with a production environment
    // that is complete except for the scheduled-jobs keys.
    const script = `
      (async () => {
        const { createJiti } = await import("jiti");
        const jiti = createJiti(${JSON.stringify(path.join(projectRoot, "probe.mjs"))}, {
          alias: {
            "@": ${JSON.stringify(path.join(projectRoot, "src"))},
            "server-only": ${JSON.stringify(path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"))},
          },
        });
        const route = await jiti.import(${JSON.stringify(path.join(projectRoot, "src/app/api/health/route.ts"))});
        const response = await route.GET();
        console.log(JSON.stringify(await response.json()));
      })();
    `;
    const out = execFileSync(process.execPath, ["-e", script], {
      env: { ...PRODUCTION_BASE, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
      encoding: "utf8",
    });
    const body = JSON.parse(out.trim().split("\n").pop());

    assert.equal(body.ok, true, "the service is live — only `degraded` changes");
    assert.equal(body.degraded, true, "a production missing the Inngest keys must report degraded");
    assert.ok(
      body.warnings.some((w) => w.code === "inngest_keys_missing"),
      `expected inngest_keys_missing, got ${JSON.stringify(body.warnings)}`,
    );
    // The endpoint is unauthenticated: a warning may name variables, never
    // values. NODE_ENV is excluded — it is the deployment mode, and the
    // messages name it on purpose.
    const configuredValues = Object.entries(PRODUCTION_BASE)
      .filter(([key]) => key !== "NODE_ENV")
      .map(([, value]) => value);
    for (const warning of body.warnings) {
      assert.ok(warning.subsystem, "each warning must name the degraded subsystem");
      for (const value of configuredValues) {
        assert.ok(
          !warning.message.includes(value),
          `a warning leaked a configured value onto an unauthenticated endpoint: ${value}`,
        );
      }
    }
  });

  await t.test("outside production the endpoint reports no degradation", () => {
    const script = `
      (async () => {
        const { createJiti } = await import("jiti");
        const jiti = createJiti(${JSON.stringify(path.join(projectRoot, "probe.mjs"))}, {
          alias: {
            "@": ${JSON.stringify(path.join(projectRoot, "src"))},
            "server-only": ${JSON.stringify(path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"))},
          },
        });
        const route = await jiti.import(${JSON.stringify(path.join(projectRoot, "src/app/api/health/route.ts"))});
        console.log(JSON.stringify(await (await route.GET()).json()));
      })();
    `;
    const out = execFileSync(process.execPath, ["-e", script], {
      env: { NODE_ENV: "development", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
      encoding: "utf8",
    });
    const body = JSON.parse(out.trim().split("\n").pop());
    assert.equal(body.degraded, false);
    assert.deepEqual(body.warnings, []);
  });
});

test("Schema completeness — it is the full inventory of what the code reads", async (t) => {
  const schemaSource = await read("src/lib/server-env.ts");

  const schemaBlock = schemaSource.slice(
    schemaSource.indexOf("const serverEnvSchema"),
    schemaSource.indexOf("type ParsedEnv"),
  );
  const declared = new Set(
    [...schemaBlock.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]),
  );

  await t.test("the schema block parses", () => {
    assert.ok(declared.size > 0, "the schema parsed as empty — update this detector");
  });

  await t.test("every variable the code reads is declared, however it is read", async () => {
    // The scanner parses the TypeScript AST rather than matching text, so it
    // covers property access, subscripting with a string literal, subscripting
    // through a name constant (env[CONSTANT]), and destructuring. A regex tuned
    // to `process.env.NAME` misses the constant form entirely, which is how
    // three flags stayed out of the schema while this test passed.
    const references = await collectEnvReferences();
    assert.ok(references.size > 0, "the scanner found nothing — it has stopped working");

    const undeclared = [...references.keys()].filter((name) => !declared.has(name)).sort();
    assert.deepEqual(
      undeclared,
      [],
      "These variables are read by the code but absent from the server-env schema:\n" +
        undeclared
          .map((name) => `  - ${name}  (read in ${references.get(name).join(", ")})`)
          .join("\n"),
    );
  });

  await t.test("the scanner resolves a variable read through a name constant", async () => {
    // Pins the capability itself: if the AST walk regresses to literal property
    // access, these disappear and the guard above silently weakens.
    const references = await collectEnvReferences();
    for (const [name, file] of [
      ["LEDGER_HASH_CHAIN_WRITE", "src/server/ledger/hash-chain-write-flag.ts"],
      ["MISSION_DURABLE_DRAFTS", "src/server/missions/mission-persistence-flag.ts"],
      ["ENABLE_STAGING_RUNTIME_DIAGNOSTIC", "src/server/runtime/staging-runtime-diagnostic.ts"],
    ]) {
      assert.ok(
        references.has(name),
        `${name} is read through env[CONSTANT] but the scanner did not find it`,
      );
      assert.ok(
        references.get(name).includes(file),
        `${name} should be attributed to ${file}, got ${references.get(name).join(", ")}`,
      );
    }
  });

  await t.test(".env.example documents every declared variable", async () => {
    const example = await read(".env.example");
    const documented = new Set(
      [...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]),
    );

    const missingFromExample = [...declared].filter((name) => !documented.has(name)).sort();
    assert.deepEqual(
      missingFromExample,
      [],
      "declared in the schema but absent from .env.example — an operator cannot " +
        `set what is not documented:\n${missingFromExample.map((n) => `  - ${n}`).join("\n")}`,
    );
  });
});

test("Configuration truth — .env.example does not promise inert wiring", async (t) => {
  await t.test("the per-agent webhook URLs are marked as read by nothing", async () => {
    const example = await read(".env.example");
    const block = example.slice(Math.max(0, example.indexOf("AGENT_MARKETING_WEBHOOK_URL") - 600));
    assert.match(
      block.slice(0, 900),
      /INERT|read by NO code path/,
      ".env.example describes the per-agent webhook URLs as functional again",
    );
  });

  await t.test("no production code reads them", async () => {
    // The scanner walks src/ and already excludes test files, so this cannot
    // match itself the way a repo-wide grep did: the previous form of this
    // assertion listed this very file, because the variable name appears in it,
    // and failed on every committed checkout.
    const references = await collectEnvReferences();
    for (const name of [
      "AGENT_MARKETING_WEBHOOK_URL",
      "AGENT_INVENTOR_WEBHOOK_URL",
      "AGENT_HERMES_WEBHOOK_URL",
    ]) {
      assert.equal(
        references.has(name),
        false,
        `${name} is now read by ${references.get(name)?.join(", ")} — ` +
          ".env.example must stop calling it inert",
      );
    }
  });
});
