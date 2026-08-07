#!/usr/bin/env node

// src/core/runtime-capability-inventory.test.mjs
//
// The inventory is what the cockpit reads to state what this runtime can do.
// These tests walk the real executor surfaces — the built-in handler map, the
// MCP tool registry, and the effect sinks reachable from API routes — and fail
// when one of them has no entry. Adding an executor without declaring it breaks
// CI before the cockpit can understate the runtime.

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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

const {
  RUNTIME_CAPABILITIES,
  RUNTIME_EFFECTS,
  RUNTIME_GATES,
  APPROVAL_RAIL_GATES,
  deriveRuntimePosture,
  isApprovalRailGate,
} = await jiti.import("@/core/runtime-capability-inventory");

const { mcpToolRegistry } = await jiti.import("@/server/agents/tools/registry");

const read = (relPath) => readFile(path.join(projectRoot, relPath), "utf8");
const toPosix = (p) => p.split(path.sep).join("/");

/** Concrete executor keys. `null` covers no single registry key. */
const inventoriedKeys = new Set(
  RUNTIME_CAPABILITIES.map((capability) => capability.executorKey).filter(
    (key) => typeof key === "string",
  ),
);

async function sourceFiles(dir = path.join(projectRoot, "src"), acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

test("Capability inventory — every claim carries proof that still holds", async (t) => {
  for (const capability of RUNTIME_CAPABILITIES) {
    await t.test(`${capability.id}: its evidence is still in the codebase`, async () => {
      let source;
      try {
        source = await read(capability.evidence.path);
      } catch {
        assert.fail(
          `${capability.id} cites ${capability.evidence.path}, which no longer exists. ` +
            "Re-evaluate the capability rather than repointing the path.",
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
    const source = await read("src/server/runtime/skill-dispatcher.ts");
    const start = source.indexOf("const BUILTIN_HANDLERS");
    assert.notEqual(start, -1, "BUILTIN_HANDLERS no longer exists — update this detector");
    const end = source.indexOf("};", start);
    assert.notEqual(end, -1, "the handler map is not a closed object literal");

    const keys = [...source.slice(start, end).matchAll(/["']([^"']+)["']\s*:/g)].map((m) => m[1]);
    assert.ok(keys.length > 0, "the handler map parsed as empty — the detector stopped working");

    for (const key of keys) {
      assert.ok(
        inventoriedKeys.has(key),
        `Built-in handler "${key}" runs in the green lane with no entry in RUNTIME_CAPABILITIES.`,
      );
    }
  });

  await t.test("every registered MCP tool is inventoried", () => {
    const registered = mcpToolRegistry.list().map((tool) => tool.name);
    assert.ok(registered.length > 0, "the MCP registry is empty — the detector stopped working");
    for (const name of registered) {
      assert.ok(
        inventoriedKeys.has(name),
        `MCP tool "${name}" is registered and dispatchable with no entry in RUNTIME_CAPABILITIES.`,
      );
    }
  });

  await t.test("every effect sink outside those registries is accounted for", async () => {
    // The two registries are not the whole runtime. Routes reach adapters that
    // send mail and repositories that persist, and none of that appears in a
    // handler map. Each sink below is a call that leaves the process or writes,
    // and must be attributable to a declared capability.
    // `pattern` finds the call in source; `marker` recognises the same sink in
    // a capability's evidence string, which names the call without its
    // parentheses.
    const SINKS = [
      { name: "Resend email send", pattern: /\.emails\.send\(/, marker: /\.emails\.send/ },
      { name: "outbound channel send", pattern: /channelSend\.send\(/, marker: /channelSend\.send/ },
      {
        name: "calendar event persist",
        pattern: /calendarRepository\.create\(/,
        marker: /calendarRepository\.create/,
      },
      {
        name: "model provider call",
        pattern: /\bgenerateStructuredJson\b\s*\(/,
        marker: /\bgenerateStructuredJson\b/,
      },
    ];

    // A sink implementation that a declared capability accounts for through a
    // different file. Scoped to the sink it covers, not the whole file, so a
    // file gaining a DIFFERENT sink later is still reported.
    const ATTRIBUTED_ELSEWHERE = {
      "src/server/outbound/resend-email-adapter.ts": {
        sink: "Resend email send",
        capability: "outbound_send_email",
      },
      "src/server/ventures/venture-score-shadow-runner.ts": {
        sink: "model provider call",
        capability: "shadow_pass_scoring",
      },
    };
    for (const { capability, sink } of Object.values(ATTRIBUTED_ELSEWHERE)) {
      assert.ok(
        RUNTIME_CAPABILITIES.some((c) => c.id === capability),
        `attribution points at "${capability}", which is not a declared capability`,
      );
      assert.ok(
        SINKS.some((s) => s.name === sink),
        `attribution names sink "${sink}", which is not in the detector`,
      );
    }

    // An evidence path covers only the sink its own marker describes. Without
    // this, a file listed as evidence for one capability would hide any other
    // sink it gains later.
    const coveredByEvidence = new Map();
    for (const capability of RUNTIME_CAPABILITIES) {
      const matching = SINKS.filter((sink) => sink.marker.test(capability.evidence.mustContain));
      if (matching.length > 0) {
        coveredByEvidence.set(
          capability.evidence.path,
          new Set(matching.map((sink) => sink.name)),
        );
      }
    }

    // The inventory itself names every sink marker as evidence; scanning it
    // would report each capability as its own undeclared executor.
    const INVENTORY_MODULE = "src/core/runtime-capability-inventory.ts";

    const undeclared = [];
    for (const file of await sourceFiles()) {
      const rel = toPosix(path.relative(projectRoot, file));
      if (rel === INVENTORY_MODULE) continue;
      const source = await readFile(file, "utf8");
      // A module that DEFINES a sink is the transport, not a call site.
      const definesSink = /export\s+(async\s+)?function\s+generateStructuredJson\b/.test(source);
      for (const sink of SINKS) {
        if (!sink.pattern.test(source)) continue;
        if (definesSink && sink.name === "model provider call") continue;
        if (coveredByEvidence.get(rel)?.has(sink.name)) continue;
        if (ATTRIBUTED_ELSEWHERE[rel]?.sink === sink.name) continue;
        undeclared.push(`${rel} — ${sink.name}`);
      }
    }

    assert.deepEqual(
      undeclared,
      [],
      "These files perform a live effect that no capability accounts for:\n" +
        undeclared.map((u) => `  - ${u}`).join("\n") +
        "\nDeclare the capability with its effect, its gate, and its evidence, or " +
        "attribute the file to an existing capability.",
    );
  });

  await t.test("a wildcard key can never satisfy a real executor", () => {
    // The dry-run preview covers no single registry key, so it declares null
    // rather than a string that a future handler could accidentally match.
    for (const capability of RUNTIME_CAPABILITIES) {
      assert.notEqual(
        capability.executorKey,
        "*",
        `${capability.id} uses a wildcard executorKey; use null for "no single key"`,
      );
    }
    assert.ok(
      RUNTIME_CAPABILITIES.some((c) => c.executorKey === null),
      "the dry-run preview must still be declared with a null executorKey",
    );
  });

  await t.test("every entry cites a file in this repository and explains itself", () => {
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

test("Capability inventory — the vocabulary is derived, never restated", async (t) => {
  await t.test("gates and effects come from the module's own arrays", () => {
    // Restating the unions here would let a new member ship uncovered.
    assert.ok(RUNTIME_EFFECTS.length > 0 && RUNTIME_GATES.length > 0);
    for (const capability of RUNTIME_CAPABILITIES) {
      assert.ok(
        RUNTIME_GATES.includes(capability.gate),
        `${capability.id}: unknown gate "${capability.gate}"`,
      );
      assert.ok(
        RUNTIME_EFFECTS.includes(capability.effect),
        `${capability.id}: unknown effect "${capability.effect}"`,
      );
    }
  });

  await t.test("approval-rail membership is a declared property of the gate", () => {
    for (const gate of RUNTIME_GATES) {
      assert.equal(isApprovalRailGate(gate), APPROVAL_RAIL_GATES.includes(gate));
    }
    assert.equal(isApprovalRailGate("ceo_approval"), true);
    assert.equal(isApprovalRailGate("public_unauthenticated"), false);
  });
});

test("Capability inventory — the cockpit reads it rather than restating it", async (t) => {
  await t.test("the control chain derives its lanes from the inventory", async () => {
    const posture = await read("src/features/cockpit/control-chain-posture.ts");
    assert.match(posture, /deriveRuntimePosture/);
    assert.match(posture, /runtime-capability-inventory/);
    // Lane membership is declared per gate, so a new gate must be routed
    // deliberately rather than joining a lane by negation.
    assert.match(posture, /LANE_BY_GATE/);
  });

  await t.test("the factory status card renders every declared capability", async () => {
    // Behavioural rather than textual: the component must iterate the inventory,
    // so a new entry appears without touching the component.
    const card = await read("src/features/hq/components/agentic-factory-status.tsx");
    assert.match(card, /RUNTIME_CAPABILITIES\.map\(/);
    assert.match(card, /deriveRuntimePosture/);
    assert.ok(
      !/statusItems\s*=\s*\[[\s\S]{0,2000}?"In-process/.test(card),
      "the card restates execution copy instead of deriving it",
    );
  });
});

test("Capability inventory — the derived posture reports the runtime honestly", async (t) => {
  await t.test("an ungated live effect can never render as locked or gated", () => {
    const bounded = deriveRuntimePosture([
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
    assert.equal(bounded.state, "bounded");

    const gated = deriveRuntimePosture([
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
    assert.equal(gated.state, "gated");

    assert.equal(deriveRuntimePosture([]).state, "locked");
  });

  await t.test("today's runtime is bounded, and names what is reachable without a session", () => {
    const posture = deriveRuntimePosture(RUNTIME_CAPABILITIES);
    assert.equal(posture.state, "bounded");

    const publicEffects = posture.effectful.filter((c) => c.gate === "public_unauthenticated");
    assert.ok(
      publicEffects.length > 0,
      "If no effectful executor is reachable without a session any more, that is a real " +
        "change — update this assertion with the change that produced it.",
    );
    for (const capability of publicEffects) {
      assert.ok(
        posture.ungatedEffects.includes(capability),
        `${capability.id} is publicly reachable but not counted as an ungated effect`,
      );
    }
  });
});
