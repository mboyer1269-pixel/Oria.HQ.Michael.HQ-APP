#!/usr/bin/env node

// src/features/cockpit/control-chain-posture.test.mjs
//
// The cockpit's control chain makes claims about this system's guardrails.
// These tests make each claim falsifiable against the repository: every stage
// carries evidence that must still hold, the ledger stage cannot claim to be
// future while writers exist, and neither lane may state a guarantee the
// capability inventory contradicts.

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

const {
  CONTROL_CHAIN_STAGES,
  GREEN_LANE_STAGES,
  DIRECT_PATH_STAGES,
  CONTROL_LANES,
  LANE_BY_GATE,
  LEDGER_STAGE_KEY,
  RUNTIME_STAGE_KEY,
} = await jiti.import("@/features/cockpit/control-chain-posture");

const { RUNTIME_CAPABILITIES, RUNTIME_GATES, deriveRuntimePosture } = await jiti.import(
  "@/core/runtime-capability-inventory",
);

const read = (relPath) => readFile(path.join(projectRoot, relPath), "utf8");
const allStages = () => CONTROL_LANES.flatMap((lane) => lane.stages);

/** Every .ts/.tsx under src/, excluding tests. */
async function sourceFiles(dir = path.join(projectRoot, "src"), out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("Control chain — every claim carries proof that still holds", async (t) => {
  for (const lane of CONTROL_LANES) {
    for (const stage of lane.stages) {
      await t.test(`${lane.key}/${stage.key}: its evidence is still in the codebase`, async () => {
        let source;
        try {
          source = await read(stage.evidence.path);
        } catch {
          assert.fail(
            `${lane.key}/${stage.key} cites ${stage.evidence.path}, which no longer exists. ` +
              `The claim "${stage.meta}" has lost its proof — re-evaluate the stage.`,
          );
        }
        assert.ok(
          source.includes(stage.evidence.mustContain),
          `${lane.key}/${stage.key} claims "${stage.meta}" because: ${stage.evidence.because}\n` +
            `But ${stage.evidence.path} no longer contains "${stage.evidence.mustContain}".`,
        );
      });
    }
  }
});

test("Control chain — the ledger stage tracks its writers", async (t) => {
  await t.test("it cannot claim to be future while writers exist", async () => {
    // Must match writes specifically: most files touching action_ledger only
    // read it, and a plain substring search would report writers with every
    // writer deleted.
    const WRITE = /\.from\(\s*["']action_ledger["']\s*\)\s*\.insert\s*\(/;

    const writers = [];
    for (const file of await sourceFiles()) {
      if (WRITE.test(await readFile(file, "utf8"))) {
        writers.push(path.relative(projectRoot, file));
      }
    }

    assert.ok(
      !writers.includes(path.join("src", "features", "cockpit", "control-chain-posture.ts")),
      "the posture file must never count as its own evidence",
    );

    const ledger = CONTROL_CHAIN_STAGES.find((stage) => stage.key === LEDGER_STAGE_KEY);
    assert.ok(ledger, "the ledger stage must exist — it is the spine of the chain");

    // Asserted in both directions: a guard that only fires inside
    // `if (writers.length > 0)` passes in silence the day the detector stops
    // matching anything.
    if (writers.length > 0) {
      assert.equal(
        ledger.state,
        "ready",
        `${writers.length} file(s) insert into action_ledger, so the stage must read "ready".`,
      );
    } else {
      assert.notEqual(
        ledger.state,
        "ready",
        "The ledger stage claims to be active, but no file inserts into action_ledger.",
      );
    }
  });
});

test("Control chain — the lanes are separated by their gates", async (t) => {
  await t.test("every lane is declared, in order of decreasing guarantee", () => {
    assert.deepEqual(
      CONTROL_LANES.map((lane) => lane.key),
      ["approval_rail", "green_lane", "direct_path"],
    );
  });

  await t.test("every gate is routed to a lane explicitly", () => {
    // Declared per gate rather than by negation: a binary split put the public
    // contact form and the scheduled shadow pass behind a Sentinelle stage
    // neither traverses.
    for (const gate of RUNTIME_GATES) {
      const lane = LANE_BY_GATE[gate];
      assert.ok(
        CONTROL_LANES.some((l) => l.key === lane),
        `gate "${gate}" routes to "${lane}", which is not a declared lane`,
      );
    }
  });

  await t.test("only the Sentinelle-gated capabilities travel the green lane", async () => {
    // The green lane opens with a Sentinelle stage, so nothing may appear on it
    // that never reaches evaluateLiveExecution.
    const green = CONTROL_LANES.find((l) => l.key === "green_lane");
    for (const id of green.capabilityIds) {
      const capability = RUNTIME_CAPABILITIES.find((c) => c.id === id);
      assert.equal(
        capability.gate,
        "sentinelle_green_lane",
        `${id} is on the green lane with gate "${capability.gate}", which never reaches the guard`,
      );
    }

    // The guard is reached from the agent routes only; anything else on that
    // lane would be describing a verdict that never happens.
    const routesCallingGuard = [
      "src/app/api/agents/[agentId]/execute/route.ts",
      "src/app/api/agents/[agentId]/execution-intents/route.ts",
      "src/app/api/agents/execution-intents/[intentId]/approve/route.ts",
    ];
    for (const route of routesCallingGuard) {
      assert.match(await read(route), /evaluateLiveExecution\(/, `${route} must call the guard`);
    }
    assert.ok(
      !/evaluateLiveExecution/.test(await read("src/app/api/contact/route.ts")),
      "the contact route now reaches the guard — revisit its lane",
    );
  });

  await t.test("the direct-path lane claims no shared guard", () => {
    const keys = DIRECT_PATH_STAGES.map((stage) => stage.key);
    assert.ok(!keys.includes("sentinelle"), "a direct path must not claim a Sentinelle verdict");
    assert.ok(!keys.includes("packet"), "a direct path must not claim an approval packet");
    assert.deepEqual(keys, ["own_gate", RUNTIME_STAGE_KEY]);

    const direct = CONTROL_LANES.find((l) => l.key === "direct_path");
    assert.ok(
      direct.capabilityIds.length > 0,
      "if nothing travels a direct path any more, that is a real change — update this test",
    );
    // The headline may name the Sentinelle, but only to deny it. What it must
    // never do is assert a verdict this lane does not receive.
    assert.ok(
      !/après verdict|verdict de la Sentinelle/i.test(direct.headline),
      `the direct-path headline claims a verdict it never receives: "${direct.headline}"`,
    );
    assert.match(
      direct.headline,
      /Ni Sentinelle ni approbation/i,
      "the direct-path headline must state what it does NOT have",
    );
  });

  await t.test("the approval rail keeps its four stages, in order", () => {
    assert.deepEqual(
      CONTROL_CHAIN_STAGES.map((stage) => stage.key),
      ["packet", "event", LEDGER_STAGE_KEY, RUNTIME_STAGE_KEY],
      "the order IS the guarantee for this lane: nothing on it executes without all four",
    );
  });

  await t.test("the green lane has no approval packet and no approval event", () => {
    // The separation that matters. If a packet stage appeared here the screen
    // would again claim approval coverage the executors do not have.
    const keys = GREEN_LANE_STAGES.map((stage) => stage.key);
    assert.ok(!keys.includes("packet"), "the green lane must not claim an approval packet");
    assert.ok(!keys.includes("event"), "the green lane must not claim an approval event");
    assert.deepEqual(keys, ["sentinelle", LEDGER_STAGE_KEY, RUNTIME_STAGE_KEY]);
  });

  await t.test("every capability travels exactly one lane, by its gate", () => {
    let total = 0;
    for (const capability of RUNTIME_CAPABILITIES) {
      const lanes = CONTROL_LANES.filter((lane) => lane.capabilityIds.includes(capability.id));
      assert.equal(lanes.length, 1, `${capability.id} must appear on exactly one lane`);
      assert.equal(
        lanes[0].key,
        LANE_BY_GATE[capability.gate],
        `${capability.id} is on the wrong lane for gate "${capability.gate}"`,
      );
    }
    for (const lane of CONTROL_LANES) total += lane.capabilityIds.length;
    assert.equal(total, RUNTIME_CAPABILITIES.length, "no capability may be dropped");
  });

  await t.test("each lane's runtime stage reflects only its own capabilities", () => {
    for (const lane of CONTROL_LANES) {
      const runtime = lane.stages.find((stage) => stage.key === RUNTIME_STAGE_KEY);
      assert.ok(runtime, `${lane.key} must have a runtime stage`);

      const own = RUNTIME_CAPABILITIES.filter((c) => lane.capabilityIds.includes(c.id));
      const posture = deriveRuntimePosture(own);
      assert.equal(runtime.state, posture.state, `${lane.key}: runtime state must be derived`);
      assert.equal(runtime.meta, posture.meta);
      assert.equal(runtime.detail, posture.detail, `${lane.key}: no prose may be prepended`);
    }
  });

  await t.test("the approval rail is gated and the other lanes are not", () => {
    // Stated as today's fact so a change forces a deliberate update rather than
    // silently flipping a guarantee on screen.
    const rail = CONTROL_CHAIN_STAGES.find((s) => s.key === RUNTIME_STAGE_KEY);
    const green = GREEN_LANE_STAGES.find((s) => s.key === RUNTIME_STAGE_KEY);
    const direct = DIRECT_PATH_STAGES.find((s) => s.key === RUNTIME_STAGE_KEY);
    assert.equal(rail.state, "gated", "every approval-rail executor must wait for a CEO approval");
    assert.equal(green.state, "bounded", "the green lane executes without an approval packet");
    assert.equal(direct.state, "bounded", "a direct path executes with no shared guard at all");
  });

  await t.test("only the approval rail claims total coverage", () => {
    for (const lane of CONTROL_LANES) {
      if (lane.key === "approval_rail") continue;
      assert.ok(
        !/chaque garde-fou|tous les garde-fous/i.test(lane.headline),
        `${lane.key} borrows the approval rail's guarantee`,
      );
    }
  });
});

test("Control chain — the posture is structurally sound", async (t) => {
  await t.test("every stage is fully specified", () => {
    for (const stage of allStages()) {
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

  await t.test("no runtime stage state is written by hand in the module", async () => {
    // Outside the StageState union, no literal runtime-state string may appear
    // anywhere in this module: the runtime stage must come from the inventory.
    const source = (await read("src/features/cockpit/control-chain-posture.ts"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    const unionAt = source.indexOf("export type StageState");
    assert.notEqual(unionAt, -1, "the StageState union must still be declared");
    const unionEnd = source.indexOf(";", unionAt);
    // A type alias needs no trailing semicolon. Without this, unionEnd is -1,
    // slice(-1) keeps one character, and the scan silently covers only the text
    // before the union.
    assert.notEqual(
      unionEnd,
      -1,
      "the StageState declaration has no terminating semicolon — this scan would cover almost nothing",
    );
    const withoutUnion = source.slice(0, unionAt) + source.slice(unionEnd);

    const runtimeStates = [...withoutUnion.matchAll(/state:\s*"(locked|gated|bounded)"/g)];
    assert.deepEqual(
      runtimeStates.map((m) => m[1]),
      [],
      "a runtime posture state is written literally instead of derived from the inventory",
    );

    assert.ok(
      !source.includes("shadow-pass"),
      "the posture reaches for one agent's self-description instead of the inventory",
    );
  });

  await t.test("the component renders the module rather than its own copy", async () => {
    const component = await read("src/features/cockpit/components/control-chain.tsx");

    assert.match(component, /CONTROL_LANES/);
    assert.ok(
      !/state:\s*"(ready|future|locked|gated|bounded)"/.test(component),
      "the component declares stage states again — the posture must have one source",
    );
  });

  await t.test("the header counts the lanes instead of naming a number", async () => {
    // A written count goes stale the moment a lane is added: the header read
    // "Deux voies" while CONTROL_LANES held three.
    const component = await read("src/features/cockpit/components/control-chain.tsx");
    const code = component.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    const headingBlock = code.slice(code.indexOf("<h3"), code.indexOf("</h3>"));
    assert.ok(headingBlock.length > 0, "the header heading no longer exists");
    assert.match(
      headingBlock,
      /laneCountHeadline\(CONTROL_LANES\.length\)/,
      "the header must derive its count from CONTROL_LANES",
    );

    // The cardinal words may exist in the lookup table, but never as the
    // rendered heading, and never in a count that contradicts the lane list.
    const wrongCardinals = ["Une voie", "Deux voies", "Trois voies", "Quatre voies"]
      .filter((_, index) => index + 1 !== CONTROL_LANES.length)
      .filter((word) => headingBlock.includes(word));
    assert.deepEqual(
      wrongCardinals,
      [],
      `the heading names ${wrongCardinals.join(", ")} while CONTROL_LANES holds ${CONTROL_LANES.length}`,
    );
  });

  await t.test("the derived headline matches the real lane count", async () => {
    // Behavioural: run the component's own helper the way the header does.
    const component = await read("src/features/cockpit/components/control-chain.tsx");
    const table = component.slice(
      component.indexOf("const LANE_COUNT_WORD"),
      component.indexOf("function laneCountHeadline"),
    );
    const words = Object.fromEntries(
      [...table.matchAll(/(\d+):\s*"([^"]+)"/g)].map((m) => [Number(m[1]), m[2]]),
    );
    assert.ok(
      words[CONTROL_LANES.length],
      `no cardinal declared for ${CONTROL_LANES.length} lanes — the header would fall back to digits`,
    );
    assert.match(
      words[CONTROL_LANES.length],
      /voies? mènent?/,
      "the cardinal must read as a sentence about lanes",
    );
  });

  await t.test("the lane pill is sourced, not written by hand", async () => {
    const component = await read("src/features/cockpit/components/control-chain.tsx");
    const code = component.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

    assert.ok(
      !/Runtime verrouillé|Verrouillé/.test(code),
      "the pill hardcodes a runtime state instead of reading it from the posture",
    );
    assert.match(code, /runtimeStage/, "the pill must read the runtime stage");
  });
});
