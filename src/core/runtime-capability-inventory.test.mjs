#!/usr/bin/env node

// src/core/runtime-capability-inventory.test.mjs
//
// The inventory is what the cockpit reads to say what this runtime can do.
// A hand-authored list of that kind rots the moment someone ships an executor
// and forgets it — which is exactly what happened before it existed: the green
// lane gained a handler that calls a model API over the network while the
// screen kept saying "In-process mock execution only" and "Runtime verrouillé".
//
// So the list is not trusted. These tests walk the REAL executor registries —
// the built-in skill handlers and the MCP tool registry — and fail when one of
// them has no entry here. Adding an executor without declaring it breaks CI.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { RUNTIME_CAPABILITIES, deriveRuntimePosture } = await jiti.import(
  path.join(__dirname, "runtime-capability-inventory.ts"),
);

const { mcpToolRegistry } = await jiti.import(
  path.join(projectRoot, "src/server/agents/tools/registry.ts"),
);

const read = (relPath) => readFile(path.join(projectRoot, relPath), "utf8");

const inventoriedKeys = new Set(RUNTIME_CAPABILITIES.map((capability) => capability.executorKey));

test("Capability inventory — every claim carries proof that still holds", async (t) => {
  for (const capability of RUNTIME_CAPABILITIES) {
    await t.test(`${capability.id}: its evidence is still in the codebase`, async () => {
      let source;
      try {
        source = await read(capability.evidence.path);
      } catch {
        assert.fail(
          `${capability.id} cites ${capability.evidence.path}, which no longer exists. ` +
            "Re-evaluate the capability — do not just repoint the path.",
        );
      }
      assert.ok(
        source.includes(capability.evidence.mustContain),
        `${capability.id} claims "${capability.detail}" because: ${capability.evidence.because}\n` +
          `But ${capability.evidence.path} no longer contains "${capability.evidence.mustContain}".`,
      );
    });
  }
});

test("Capability inventory — no live executor escapes it", async (t) => {
  await t.test("every built-in skill handler is inventoried", async () => {
    // The green lane executes a skill in-process when BUILTIN_HANDLERS holds a
    // key for it; everything else previews. Each key is therefore a real
    // executor, and content.generate proves they are not all inert: it calls a
    // model API over the network.
    const source = await read("src/server/runtime/skill-dispatcher.ts");
    const start = source.indexOf("const BUILTIN_HANDLERS");
    assert.notEqual(start, -1, "BUILTIN_HANDLERS no longer exists — update this detector");

    // Bounded to the object literal, and matching ANY value form. Keying on
    // `": handle"` would have missed an inline arrow, and a detector that
    // silently stops matching is the failure this whole file exists to prevent.
    const end = source.indexOf("};", start);
    assert.notEqual(end, -1, "the handler map is not a closed object literal — update this detector");
    const block = source.slice(start, end);

    const keys = [...block.matchAll(/["']([^"']+)["']\s*:/g)].map((match) => match[1]);
    assert.ok(keys.length > 0, "the handler map parsed as empty — the detector has stopped working");

    for (const key of keys) {
      assert.ok(
        inventoriedKeys.has(key),
        `Built-in handler "${key}" runs in the green lane but has no entry in ` +
          "RUNTIME_CAPABILITIES. The cockpit would describe a runtime that no longer exists. " +
          "Add it with its effect, its gate, and the evidence that proves both.",
      );
    }
  });

  await t.test("every registered MCP tool is inventoried", () => {
    // A registered tool is reachable by the approve route via its name. One
    // that nothing declares is an undocumented way out of the process.
    const registered = mcpToolRegistry.list().map((tool) => tool.name);
    assert.ok(registered.length > 0, "the MCP registry parsed as empty");

    for (const name of registered) {
      assert.ok(
        inventoriedKeys.has(name),
        `MCP tool "${name}" is registered and dispatchable but has no entry in ` +
          "RUNTIME_CAPABILITIES. Declare its effect and its gate.",
      );
    }
  });

  await t.test("no entry describes an executor that has been removed", () => {
    // The inverse rot: an inventory that keeps naming a deleted executor
    // overstates the runtime just as badly as one that misses a new one.
    // The evidence check above catches it; this pins the intent explicitly.
    for (const capability of RUNTIME_CAPABILITIES) {
      assert.ok(
        capability.evidence.path.startsWith("src/"),
        `${capability.id} must cite a file in this repository`,
      );
      assert.ok(
        capability.evidence.because.trim().length > 20,
        `${capability.id}: 'because' must explain the proof to whoever hits the failure`,
      );
    }
  });
});

test("Capability inventory — the cockpit reads it rather than restating it", async (t) => {
  await t.test("the control chain derives its runtime stage from the inventory", async () => {
    const posture = await read("src/features/cockpit/control-chain-posture.ts");
    assert.match(posture, /deriveRuntimePosture/);
    assert.match(posture, /runtime-capability-inventory/);
  });

  await t.test("the factory status card is derived, not hand-written", async () => {
    // Two of its cards used to read "In-process mock execution only" and
    // "VPS execution and writes suspended". Both were false and nothing failed.
    const source = await read("src/features/hq/components/agentic-factory-status.tsx");
    assert.match(source, /RUNTIME_CAPABILITIES/);

    // Comments stripped: the header names both false claims so a reader knows
    // what went wrong. What must not come back is either one as rendered copy.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/mock execution only/i.test(code),
      "the card claims mock-only execution again — the green lane calls a model API",
    );
    assert.ok(
      !/writes suspended/i.test(code),
      "the card claims writes are suspended again — the ledger has writers",
    );
  });
});

test("Capability inventory — the derived posture cannot understate the runtime", async (t) => {
  await t.test("today's inventory holds at least one ungated live effect", () => {
    // Stated as the current fact, so that the day it changes, someone reads
    // this test and confirms the runtime really did close rather than the
    // detector silently stopping.
    const posture = deriveRuntimePosture(RUNTIME_CAPABILITIES);
    assert.equal(posture.state, "bounded");
    assert.ok(
      posture.ungatedEffects.length > 0,
      "If every effect is now behind CEO approval, this suite should read 'gated' — " +
        "update this assertion deliberately, with the change that closed the gap.",
    );
  });

  await t.test("a capability with an effect can never be gate-free in the model", () => {
    for (const capability of RUNTIME_CAPABILITIES) {
      assert.ok(
        ["ceo_approval", "sentinelle_green_lane", "scheduled_pass"].includes(capability.gate),
        `${capability.id}: unknown gate "${capability.gate}"`,
      );
      assert.ok(
        ["none", "internal_write", "external_call"].includes(capability.effect),
        `${capability.id}: unknown effect "${capability.effect}"`,
      );
    }
  });
});
