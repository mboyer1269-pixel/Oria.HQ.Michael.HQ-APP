#!/usr/bin/env node

// src/lib/server-env.test.mjs
//
// The environment schema is the contract between a deployment and this app.
// When it is incomplete, the failure is the worst kind: the app boots, reports
// nothing wrong, and refuses every request.
//
// That is exactly what NEXT_PUBLIC_SUPABASE_ANON_KEY did. It was absent from
// the schema entirely while createServerSupabaseClient() required it, so
// production could start with the URL and the service-role key present, pass
// the fail-fast, and then answer 401 to the owner on every route: the client
// constructor throws, getCurrentAuthUser() maps that to "no user", and the gate
// refuses. Nothing said why.
//
// These tests assert three things stay true: the fail-fast covers what auth
// actually needs, the schema is the complete inventory of what the code reads,
// and .env.example does not disagree with the schema.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const read = (relPath) => readFile(path.join(projectRoot, relPath), "utf8");

/**
 * Loads server-env in a CHILD process with a chosen environment.
 *
 * The module fail-fasts at import time, so the check cannot be exercised
 * in-process: the first import wins for the lifetime of this one.
 */
function loadServerEnvWith(env) {
  const script = `
    const path = require("node:path");
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
    // The regression this file exists for. Before, this booted clean.
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
    // Deliberate asymmetry. Inngest's absence degrades one rail; turning that
    // into a boot failure would take the whole app down to protect a subsystem
    // that is currently frozen. It is reported, not thrown.
    const result = loadServerEnvWith(PRODUCTION_BASE);
    assert.equal(result.ok, true);

    const source = await read("src/lib/server-env.ts");
    assert.match(source, /getProductionReadinessWarnings/);
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

test("Schema completeness — it is the full inventory of what the code reads", async (t) => {
  const schemaSource = await read("src/lib/server-env.ts");

  await t.test("every environment variable read by src/ is declared", async () => {
    // Catches the whole class of defect, not just the anon key: a variable the
    // code depends on but the schema has never heard of.
    const files = execFileSync(
      "git",
      ["ls-files", "src/**/*.ts", "src/**/*.tsx"],
      { cwd: projectRoot, encoding: "utf8" },
    )
      .split("\n")
      .filter((f) => f && !/\.test\.(ts|tsx)$/.test(f));

    const referenced = new Set();
    for (const file of files) {
      const source = await read(file);
      for (const match of source.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]+)/g)) {
        referenced.add(match[1]);
      }
      // Name constants: `export const X_ENV_VAR = "ORIA_ENABLE_Y";`
      for (const match of source.matchAll(/ENV_VAR\s*=\s*"([A-Z][A-Z0-9_]+)"/g)) {
        referenced.add(match[1]);
      }
    }

    // Runtime-provided, never configured by an operator.
    const INTRINSIC = new Set(["NODE_ENV", "NEXT_PHASE", "PATH"]);

    const undeclared = [...referenced]
      .filter((name) => !INTRINSIC.has(name))
      .filter((name) => !new RegExp(`\\b${name}\\s*:`).test(schemaSource));

    assert.deepEqual(
      undeclared,
      [],
      `These variables are read by the code but absent from the server-env schema:\n` +
        undeclared.map((n) => `  - ${n}`).join("\n") +
        "\nAn undeclared variable cannot be validated, documented, or fail-fasted.",
    );
  });

  await t.test(".env.example and the schema name the same variables", async () => {
    const example = await read(".env.example");
    const documented = new Set(
      [...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]),
    );

    const schemaBlock = schemaSource.slice(
      schemaSource.indexOf("const serverEnvSchema"),
      schemaSource.indexOf("type ParsedEnv"),
    );
    const declared = new Set(
      [...schemaBlock.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]),
    );
    assert.ok(declared.size > 0, "the schema parsed as empty — update this detector");

    const missingFromExample = [...declared].filter((name) => !documented.has(name));
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
    // They were documented as wiring "each agent to an external workflow tool
    // for live skill execution". No code path reads them; the only dispatcher
    // resolves N8N_WEBHOOK_URL. An operator following that text configured
    // nothing and had no way to find out.
    const example = await read(".env.example");
    const block = example.slice(example.indexOf("AGENT_MARKETING_WEBHOOK_URL") - 600);
    assert.match(
      block.slice(0, 900),
      /INERT|read by NO code path/,
      ".env.example describes the per-agent webhook URLs as functional again",
    );

    const usage = execFileSync(
      "git",
      ["grep", "-l", "AGENT_MARKETING_WEBHOOK_URL", "--", "src"],
      { cwd: projectRoot, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    assert.deepEqual(
      usage,
      ["src/lib/server-env.ts"],
      "a code path started reading AGENT_MARKETING_WEBHOOK_URL — .env.example must stop calling it inert",
    );
  });
});
