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

const { CONTROL_CHAIN_STAGES, LEDGER_STAGE_KEY, RUNTIME_STAGE_KEY } = await jiti.import(
  path.join(__dirname, "control-chain-posture.ts"),
);

const { RUNTIME_CAPABILITIES, deriveRuntimePosture } = await jiti.import(
  path.join(projectRoot, "src/core/runtime-capability-inventory.ts"),
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

    // Asserted in both directions, and never conditionally: a guard that only
    // fires inside `if (writers.length > 0)` passes in silence the day the
    // detector stops matching anything, and one that only names "future"
    // ignores every other wrong state the stage could hold.
    if (writers.length > 0) {
      assert.equal(
        ledger.state,
        "ready",
        `${writers.length} file(s) insert into action_ledger (${writers.join(", ")}), ` +
          `so the ledger stage must read "ready". It reads "${ledger.state}".`,
      );
    } else {
      assert.notEqual(
        ledger.state,
        "ready",
        "The ledger stage claims to be active, but no file inserts into action_ledger. " +
          "Either the writers are gone and the stage must change, or the detector no longer matches them.",
      );
    }
  });

  await t.test("the runtime stage is derived, never written by hand", async () => {
    // The second rot, and the more dangerous one. This stage used to read
    // "verrouillé" on the strength of one marker in shadow-pass.ts — a claim
    // about a single agent, standing in for the whole runtime. It stayed true
    // while an unrelated executor that calls a model API over the network
    // shipped and became reachable. Watching one file cannot notice an
    // executor added to another.
    const runtime = CONTROL_CHAIN_STAGES.find((stage) => stage.key === RUNTIME_STAGE_KEY);
    assert.ok(runtime, "the runtime stage must exist");

    const posture = deriveRuntimePosture(RUNTIME_CAPABILITIES);
    assert.equal(
      runtime.state,
      posture.state,
      "the runtime stage must carry the posture the inventory derives, unflattened",
    );
    assert.equal(runtime.meta, posture.meta);

    // Comments stripped: the header explains the rot by name, and the point is
    // that no CODE reaches for that file or writes the state by hand.
    const source = (await read("src/features/cockpit/control-chain-posture.ts"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    assert.ok(
      !/key:\s*"runtime"[\s\S]{0,400}?state:\s*"/.test(source),
      "the runtime stage declares a literal state again — it must come from the inventory",
    );
    assert.ok(
      !source.includes("shadow-pass"),
      "the posture reaches for shadow-pass again: one agent's self-description " +
        "is not the state of the runtime",
    );
  });

  await t.test("an ungated live effect can never render as locked", async () => {
    // The property that matters, asserted against the derivation rather than
    // against today's inventory: as soon as one effectful executor sits outside
    // the CEO approval rail, "verrouillé" is unavailable as an answer.
    const withUngatedEffect = deriveRuntimePosture([
      {
        id: "probe",
        label: "Probe",
        executorKey: "probe",
        effect: "external_call",
        gate: "sentinelle_green_lane",
        detail: "",
        evidence: { path: "x", mustContain: "y", because: "z" },
      },
    ]);
    assert.equal(withUngatedEffect.state, "bounded");

    const allGated = deriveRuntimePosture([
      {
        id: "probe",
        label: "Probe",
        executorKey: "probe",
        effect: "external_call",
        gate: "ceo_approval",
        detail: "",
        evidence: { path: "x", mustContain: "y", because: "z" },
      },
    ]);
    assert.equal(allGated.state, "gated");

    assert.equal(deriveRuntimePosture([]).state, "locked");
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
      assert.ok(
        ["ready", "future", "locked", "gated", "bounded"].includes(stage.state),
        `${stage.key}: bad state`,
      );
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
      !/state:\s*"(ready|future|locked|gated|bounded)"/.test(component),
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
