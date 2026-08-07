#!/usr/bin/env node

// src/features/cockpit/control-chain-posture.test.mjs
//
// The cockpit's control chain claims things about this system's guardrails.
// These tests make those claims falsifiable.
//
// The posture used to be a hardcoded array inside the component. It announced
// "Ledger Entry — à venir" long after the ledger had gone live with a dozen
// writers, and nothing failed, because nothing was looking. Every assertion
// below exists so that the next drift breaks CI instead of reaching the cockpit.

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { CONTROL_CHAIN_STAGES, LEDGER_STAGE_KEY } = await jiti.import(
  path.join(__dirname, "control-chain-posture.ts"),
);

const read = (relPath) => readFile(path.join(projectRoot, relPath), "utf8");

/** Every .ts/.tsx under src/, excluding tests. */
async function sourceFiles(dir = path.join(projectRoot, "src")) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await sourceFiles(full)));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

test("Control chain — every claim carries proof that still holds", async (t) => {
  for (const stage of CONTROL_CHAIN_STAGES) {
    await t.test(`${stage.key}: its evidence is still in the codebase`, async () => {
      let source;
      try {
        source = await read(stage.evidence.path);
      } catch {
        assert.fail(
          `${stage.key} cites ${stage.evidence.path}, which no longer exists. ` +
            `The claim "${stage.meta}" has lost its proof — re-evaluate the stage, do not just repoint the path.`,
        );
      }

      assert.ok(
        source.includes(stage.evidence.mustContain),
        `${stage.key} claims "${stage.meta}" because: ${stage.evidence.because}\n` +
          `But ${stage.evidence.path} no longer contains "${stage.evidence.mustContain}".`,
      );
    });
  }
});

test("Control chain — the specific rot that produced this module", async (t) => {
  await t.test("the ledger stage cannot claim to be future while it has writers", async () => {
    // Assert against the codebase, not against a comment.
    //
    // It must match writes specifically. Most files touching action_ledger only
    // read it (action-ledger-read, shadow-cronbeat, shadow-proposal-dedup), and
    // this very posture file names the table in its evidence marker — a plain
    // substring search counts all of them and would report "writers exist"
    // with every writer deleted.
    const WRITE = /\.from\(\s*["']action_ledger["']\s*\)\s*\.insert\s*\(/;

    const files = await sourceFiles();
    const writers = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (WRITE.test(source)) {
        writers.push(path.relative(projectRoot, file));
      }
    }

    assert.ok(
      !writers.includes("src/features/cockpit/control-chain-posture.ts"),
      "the posture file must never count as its own evidence",
    );

    const ledger = CONTROL_CHAIN_STAGES.find((stage) => stage.key === LEDGER_STAGE_KEY);
    assert.ok(ledger, "the ledger stage must exist — it is the spine of the chain");

    // Both directions, and neither is allowed to be vacuous. A guard that
    // only fires inside `if (writers.length > 0)` passes silently the day the
    // detector stops matching anything — which is the failure it exists to catch.
    if (ledger.state === "ready") {
      assert.ok(
        writers.length > 0,
        "The ledger stage claims to be active, but no file inserts into action_ledger. " +
          "Either the writers are gone and the stage must change, or the detector no longer matches them.",
      );
    }

    if (writers.length > 0) {
      assert.notEqual(
        ledger.state,
        "future",
        `The ledger stage says "future", but ${writers.length} file(s) insert into action_ledger: ` +
          `${writers.join(", ")}. The cockpit would be misreporting its own guarantee.`,
      );
    }
  });

  await t.test("runtime stays locked as long as nothing claims to execute", async () => {
    // The inverse risk: leaving "verrouillé" on screen after execution ships
    // would be the same lie in the other direction, and far more dangerous.
    const runtime = CONTROL_CHAIN_STAGES.find((stage) => stage.key === "runtime");
    assert.equal(runtime.state, "locked");

    const shadowPass = await read(runtime.evidence.path);
    assert.ok(
      shadowPass.includes("it executes nothing"),
      "The most autonomous agent no longer declares itself execution-free. " +
        "Runtime may no longer be locked — verify before shipping this screen.",
    );
  });
});

test("Control chain — the posture is structurally sound", async (t) => {
  await t.test("the four stages are present, in order", () => {
    assert.deepEqual(
      CONTROL_CHAIN_STAGES.map((stage) => stage.key),
      ["packet", "event", "ledger", "runtime"],
      "the order IS the guarantee: nothing executes without traversing all four",
    );
  });

  await t.test("every stage is fully specified", () => {
    for (const stage of CONTROL_CHAIN_STAGES) {
      assert.ok(["ready", "future", "locked"].includes(stage.state), `${stage.key}: bad state`);
      for (const field of ["label", "detail", "meta"]) {
        assert.ok(stage[field]?.trim().length > 0, `${stage.key}: empty ${field}`);
      }
      assert.ok(
        stage.evidence.because.trim().length > 20,
        `${stage.key}: 'because' must explain the proof to whoever hits the failure`,
      );
    }
  });

  await t.test("the component renders the module rather than its own copy", async () => {
    // The whole point. A second hardcoded array in the component would rot
    // exactly as the first one did.
    const component = await read("src/features/cockpit/components/control-chain.tsx");

    assert.match(component, /CONTROL_CHAIN_STAGES/);
    assert.ok(
      !/state:\s*"(ready|future|locked)"/.test(component),
      "the component declares stage states again — the posture must have one source",
    );
  });

  await t.test("the header pill is sourced, not written by hand", async () => {
    // The pill summarises the runtime stage. Hardcoding it puts the same claim
    // in two places, and the copy that is not derived is the one that survives
    // a transition — still reading "verrouillé" after execution ships.
    const component = await read("src/features/cockpit/components/control-chain.tsx");
    const code = component.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

    assert.ok(
      !/Runtime verrouillé/.test(code),
      "the pill hardcodes the runtime state instead of reading it from the posture",
    );
    assert.match(code, /runtimeStage/, "the pill must read the runtime stage");
  });
});
