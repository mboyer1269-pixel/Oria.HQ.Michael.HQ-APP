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
  INVENTORY_SCOPE,
  OUT_OF_SCOPE_EFFECT_SURFACES,
  OUT_OF_SCOPE_SURFACES,
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

/** Files a capability accounts for: its evidence path plus anything it covers. */
const capabilityFiles = new Set(
  RUNTIME_CAPABILITIES.flatMap((capability) => [
    capability.evidence.path,
    ...(capability.covers ?? []),
  ]),
);

const outOfScopeFiles = new Set(OUT_OF_SCOPE_SURFACES.flatMap((group) => group.paths));
const outOfScopeEffectFiles = new Set(
  OUT_OF_SCOPE_EFFECT_SURFACES.flatMap((group) => group.paths),
);

const SUPABASE_MUTATION =
  /\.from\(\s*["'`][a-z_]+["'`]\s*\)[\s\S]{0,300}?\.(insert|upsert|update|delete)\(/;
const SERVER_ACTION = /^\s*["']use server["']/m;

function mutationKinds(source) {
  const kinds = [];
  if (SUPABASE_MUTATION.test(source)) kinds.push("Supabase mutation");
  if (SERVER_ACTION.test(source)) kinds.push("server action");
  return kinds;
}

// Calls that cross a process or network boundary. Browser calls to this app's
// own /api routes are transport to a server-side effect and are counted at the
// server implementation, not a second time in the client component.
const EFFECT_SINKS = [
  {
    name: "direct external fetch",
    pattern: /\bfetch\s*\(\s*(?!["'`]\/api(?:\/|["'`]))/,
    marker: /\bfetch\s*\(/,
  },
  {
    name: "injected external fetch",
    pattern: /\b(?:fetchImpl|fetchFn)\s*\(/,
    marker: /\b(?:fetchImpl|fetchFn)\s*\(/,
  },
  {
    name: "child process",
    pattern: /\b(?:execFile|execFileSync|spawn|spawnSync)\s*\(/,
    marker: /\b(?:execFile|execFileSync|spawn|spawnSync)\s*\(/,
  },
  {
    name: "MCP stdio client",
    pattern: /(?:new\s+StdioClientTransport|client\.(?:connect|callTool)\s*\()/,
    marker: /(?:StdioClientTransport|client\.(?:connect|callTool)\s*\()/,
  },
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

function detectedEffectSinks(rel, source) {
  return EFFECT_SINKS.filter((sink) => {
    if (
      sink.name === "direct external fetch" &&
      /\.tsx$/.test(rel) &&
      !SERVER_ACTION.test(source)
    ) {
      return false;
    }
    if (
      sink.name === "model provider call" &&
      /export\s+(async\s+)?function\s+generateStructuredJson\b/.test(source)
    ) {
      return false;
    }
    return sink.pattern.test(source);
  });
}

// Shared transports are implementations of the caller capabilities, not
// additional executors. Keep the attribution sink-specific so a file gaining a
// different outbound call still fails the scan.
const ATTRIBUTED_ELSEWHERE = {
  "src/server/ai/anthropic-json-client.ts": [
    {
      sink: "injected external fetch",
      capabilities: [
        "shadow_pass_scoring",
        "joris_reply_generation",
        "daily_direction_generation",
        "cash_action_packet_generation",
      ],
    },
  ],
  "src/server/ai/openai-json-client.ts": [
    {
      sink: "injected external fetch",
      capabilities: [
        "shadow_pass_scoring",
        "joris_reply_generation",
        "daily_direction_generation",
        "cash_action_packet_generation",
      ],
    },
  ],
  "src/server/agents/tools/n8n-webhook-trigger.ts": [
    { sink: "injected external fetch", capabilities: ["n8n_webhook_dispatch"] },
  ],
  "src/server/outbound/resend-email-adapter.ts": [
    { sink: "Resend email send", capabilities: ["outbound_send_email"] },
  ],
  "src/server/ventures/shadow-source-verifier.ts": [
    { sink: "injected external fetch", capabilities: ["shadow_pass_scoring"] },
  ],
};

async function sourceFiles(dir = path.join(projectRoot, "src"), acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await sourceFiles(full, acc);
    else if (
      /\.(?:[cm]?[jt]sx?)$/.test(entry.name) &&
      !/\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(entry.name)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

function capabilitiesCoveringEffect(rel, sink, coveredByEvidence) {
  const ids = new Set();
  for (const capability of RUNTIME_CAPABILITIES) {
    if (
      capability.evidence.path === rel &&
      coveredByEvidence.get(rel)?.has(sink.name)
    ) {
      ids.add(capability.id);
    }
  }
  for (const attribution of ATTRIBUTED_ELSEWHERE[rel] ?? []) {
    if (attribution.sink !== sink.name) continue;
    for (const id of attribution.capabilities) ids.add(id);
  }
  return [...ids];
}

function buildCoveredByEvidence() {
  const coveredByEvidence = new Map();
  for (const capability of RUNTIME_CAPABILITIES) {
    const matching = EFFECT_SINKS.filter((sink) =>
      sink.marker.test(capability.evidence.mustContain),
    );
    if (matching.length === 0) continue;
    const covered = coveredByEvidence.get(capability.evidence.path) ?? new Set();
    for (const sink of matching) covered.add(sink.name);
    coveredByEvidence.set(capability.evidence.path, covered);
  }
  return coveredByEvidence;
}

function importedSourceSpecifiers(source) {
  return [
    ...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g),
  ].map((match) => match[1]);
}

function resolveSourceSpecifier(fromRel, specifier, knownFiles) {
  let base;
  if (specifier.startsWith("@/")) {
    base = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith(".")) {
    base = toPosix(path.normalize(path.join(path.dirname(fromRel), specifier)));
  } else {
    return null;
  }

  const candidates = [
    base,
    ...["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"].map(
      (extension) => `${base}.${extension}`,
    ),
    ...["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"].map(
      (extension) => `${base}/index.${extension}`,
    ),
  ];
  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

async function reachableSourceFiles(entry, files) {
  const knownFiles = new Set(
    files.map((file) => toPosix(path.relative(projectRoot, file))),
  );
  const reached = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const rel = queue.shift();
    if (!rel || reached.has(rel) || !knownFiles.has(rel)) continue;
    reached.add(rel);
    const source = await read(rel);
    for (const specifier of importedSourceSpecifiers(source)) {
      const resolved = resolveSourceSpecifier(rel, specifier, knownFiles);
      if (resolved && !reached.has(resolved)) queue.push(resolved);
    }
  }
  return reached;
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
  await t.test("the reachability detector includes every import form", () => {
    assert.deepEqual(
      importedSourceSpecifiers(`
        import "@/side-effect";
        import { helper } from "@/static";
        const lazy = import("@/dynamic");
      `),
      ["@/side-effect", "@/static", "@/dynamic"],
    );
  });

  await t.test("the effect detector sees direct, injected, process, and external-client calls", () => {
    const detected = (source) =>
      new Set(detectedEffectSinks("src/server/probe.ts", source).map((sink) => sink.name));

    assert.ok(detected('await fetch("https://example.com")').has("direct external fetch"));
    assert.ok(detected("await fetch(url)").has("direct external fetch"));
    assert.ok(detected("await fetchImpl(url)").has("injected external fetch"));
    assert.ok(detected("await fetchFn(url)").has("injected external fetch"));
    assert.ok(detected("execFile(binary, args, callback)").has("child process"));
    assert.ok(detected("spawn(binary, args)").has("child process"));
    assert.ok(detected("await client.callTool(input)").has("MCP stdio client"));
    assert.ok(detected("await resend.emails.send(input)").has("Resend email send"));
    assert.ok(detected("await generateStructuredJson(input)").has("model provider call"));
    assert.equal(
      detected('await fetch("/api/internal")').has("direct external fetch"),
      false,
      "the browser-to-own-route transport is counted at its server effect",
    );
  });

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
    for (const attributions of Object.values(ATTRIBUTED_ELSEWHERE)) {
      for (const { capabilities, sink } of attributions) {
        assert.ok(
          EFFECT_SINKS.some((candidate) => candidate.name === sink),
          `attribution names sink "${sink}", which is not in the detector`,
        );
        for (const capability of capabilities) {
          assert.ok(
            RUNTIME_CAPABILITIES.some((candidate) => candidate.id === capability),
            `attribution points at "${capability}", which is not a declared capability`,
          );
        }
      }
    }

    // Multiple capabilities may cite one implementation with different sinks.
    // The helper merges those sets so the last declaration cannot erase prior
    // evidence.
    const coveredByEvidence = buildCoveredByEvidence();

    // The inventory itself names every sink marker as evidence; scanning it
    // would report each capability as its own undeclared executor.
    const INVENTORY_MODULE = "src/core/runtime-capability-inventory.ts";

    const undeclared = [];
    for (const file of await sourceFiles()) {
      const rel = toPosix(path.relative(projectRoot, file));
      if (rel === INVENTORY_MODULE) continue;
      const source = await readFile(file, "utf8");
      for (const sink of detectedEffectSinks(rel, source)) {
        if (coveredByEvidence.get(rel)?.has(sink.name)) continue;
        if ((ATTRIBUTED_ELSEWHERE[rel] ?? []).some((entry) => entry.sink === sink.name)) {
          continue;
        }
        if (outOfScopeEffectFiles.has(rel)) continue;
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

  await t.test("the named inventory and marketplace network surfaces are classified exactly", () => {
    const required = [
      ["syncPublicInventory", "src/server/inventory/public-inventory-sync.ts"],
      ["fetchMarketAdvantageBrief", "src/server/market/fetch-market-comps.ts"],
      ["vdp-photo-enrich", "src/server/inventory/vdp-photo-enrich.ts"],
      ["build-photo-pack", "src/server/marketplace-listings/build-photo-pack.ts"],
    ];
    for (const [name, rel] of required) {
      assert.ok(
        capabilityFiles.has(rel) || outOfScopeEffectFiles.has(rel),
        `${name} (${rel}) is neither inventoried nor explicitly excluded`,
      );
    }
  });

  await t.test("every process or network boundary reachable from Joris has an owner-controlled gate", async () => {
    const files = await sourceFiles();
    const reached = await reachableSourceFiles("src/app/api/joris/chat/route.ts", files);
    const coveredByEvidence = buildCoveredByEvidence();
    const expectedJorisEffects = [
      "src/server/inventory/public-inventory-sync.ts",
      "src/server/inventory/vdp-photo-enrich.ts",
      "src/server/market/fetch-market-comps.ts",
      "src/server/mcp/memex-stdio-transport.ts",
    ];
    for (const rel of expectedJorisEffects) {
      assert.ok(reached.has(rel), `${rel} is no longer reachable from Joris — re-audit its gate`);
    }

    const misclassified = [];
    const ownerControlledGates = new Set(["owner_session", "owner_confirmed"]);
    for (const rel of reached) {
      const source = await read(rel);
      for (const sink of detectedEffectSinks(rel, source)) {
        assert.ok(
          !outOfScopeEffectFiles.has(rel),
          `${rel} is reachable from Joris but excluded as a manual-only effect`,
        );
        const ids = capabilitiesCoveringEffect(rel, sink, coveredByEvidence);
        const capabilities = ids.map((id) =>
          RUNTIME_CAPABILITIES.find((capability) => capability.id === id),
        );
        if (
          capabilities.length === 0 ||
          !capabilities.some((capability) => ownerControlledGates.has(capability?.gate))
        ) {
          misclassified.push(`${rel} — ${sink.name} (${ids.join(", ") || "unclassified"})`);
        }
      }
    }
    assert.deepEqual(
      misclassified,
      [],
      "These effects are reachable from the owner-authenticated Joris route but no " +
        "inventory entry classifies them with an owner-controlled gate:\n" +
        misclassified.map((entry) => `  - ${entry}`).join("\n"),
    );
  });

  await t.test("every persistence and server-action surface is classified", async () => {
    // The mandate the inventory has to keep: a mutation surface is either
    // covered by a capability or listed as out of scope with a reason. Neither
    // is a failure — being neither is, because that is a surface nobody decided
    // about. Includes saveCockpitLayout's upsert and every other Supabase write.
    const unclassified = [];
    const surfaces = [];

    for (const file of await sourceFiles()) {
      const rel = toPosix(path.relative(projectRoot, file));
      const source = await readFile(file, "utf8");

      const kinds = mutationKinds(source);
      if (kinds.length === 0) continue;

      surfaces.push(rel);
      if (capabilityFiles.has(rel) || outOfScopeFiles.has(rel)) continue;
      unclassified.push(`${rel} — ${kinds.join(" + ")}`);
    }

    assert.ok(surfaces.length > 0, "no mutation surface found — the detector has stopped working");

    assert.deepEqual(
      unclassified,
      [],
      "These surfaces mutate state and are neither covered by a capability nor listed " +
        "in OUT_OF_SCOPE_SURFACES:\n" +
        unclassified.map((u) => `  - ${u}`).join("\n") +
        "\nDeclare the capability, or add the file to OUT_OF_SCOPE_SURFACES with the " +
        "reason it is not presented as a runtime capability.",
    );
  });

  await t.test("the out-of-scope list names only files that still exist and still mutate", async () => {
    // The inverse rot: an exclusion for a deleted or now-inert file quietly
    // widens the list and could later shadow a real surface at the same path.
    for (const group of OUT_OF_SCOPE_SURFACES) {
      assert.ok(
        group.reason.trim().length > 40,
        `an out-of-scope group must explain itself: "${group.reason}"`,
      );
      for (const rel of group.paths) {
        let source;
        try {
          source = await read(rel);
        } catch {
          assert.fail(`OUT_OF_SCOPE_SURFACES lists ${rel}, which no longer exists`);
        }
        assert.ok(
          mutationKinds(source).length > 0,
          `OUT_OF_SCOPE_SURFACES lists ${rel}, which no longer mutates anything`,
        );
      }
    }
  });

  await t.test(
    "the out-of-scope effect list names only files that still exist and still cross a boundary",
    async () => {
      for (const group of OUT_OF_SCOPE_EFFECT_SURFACES) {
        assert.ok(
          group.reason.trim().length > 40,
          `an out-of-scope effect group must explain itself: "${group.reason}"`,
        );
        for (const rel of group.paths) {
          let source;
          try {
            source = await read(rel);
          } catch {
            assert.fail(`OUT_OF_SCOPE_EFFECT_SURFACES lists ${rel}, which no longer exists`);
          }
          assert.ok(
            detectedEffectSinks(rel, source).length > 0,
            `OUT_OF_SCOPE_EFFECT_SURFACES lists ${rel}, which no longer crosses a boundary`,
          );
        }
      }
    },
  );

  await t.test("no file is both covered by a capability and excluded", () => {
    for (const rel of outOfScopeFiles) {
      assert.ok(
        !capabilityFiles.has(rel),
        `${rel} is both covered by a capability and listed as out of scope`,
      );
    }
    for (const rel of outOfScopeEffectFiles) {
      assert.ok(
        !capabilityFiles.has(rel),
        `${rel} is both covered by a capability and excluded as a manual utility`,
      );
    }
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
  });

  await t.test("no status card asserts a state without a counted source", async () => {
    // A card whose pill is a fixed word states something no registry backs.
    // Every `state` must be an expression, and every card must name its source.
    const card = await read("src/features/hq/components/agentic-factory-status.tsx");
    const block = card.slice(card.indexOf("const statusItems"), card.indexOf("return ("));
    assert.ok(block.length > 0, "statusItems no longer exists — update this detector");

    const literalStates = [...block.matchAll(/^\s*state:\s*"([^"]*)"/gm)].map((m) => m[1]);
    assert.deepEqual(
      literalStates,
      [],
      "these cards assert a hardcoded state with no registry behind it: " +
        literalStates.map((s) => `"${s}"`).join(", "),
    );

    const cardCount = [...block.matchAll(/^\s{6}label:/gm)].length;
    const sourceCount = [...block.matchAll(/^\s{6}source:/gm)].length;
    assert.ok(cardCount > 0, "no card parsed — update this detector");
    assert.equal(sourceCount, cardCount, "every card must name the registry it counts");
  });

  await t.test("counts are presented with the scope they belong to", async () => {
    // A number without its boundary reads as a total. The panel states the
    // scope, and the scope itself says what it leaves out.
    assert.ok(INVENTORY_SCOPE.covers.trim().length > 20);
    assert.ok(INVENTORY_SCOPE.excludes.trim().length > 20);

    const card = await read("src/features/hq/components/agentic-factory-status.tsx");
    assert.match(card, /INVENTORY_SCOPE\.covers/);
    assert.match(card, /INVENTORY_SCOPE\.excludes/);
    assert.ok(
      !/l'ensemble du runtime\b(?![\s\S]{0,80}pas)/.test(card),
      "the panel claims to cover the whole runtime",
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
