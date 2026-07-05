#!/usr/bin/env node
/**
 * Joris Memex Evidence Preview — golden smoke (deterministic, local-only).
 *
 * Proves the PR #335 preview surface:
 *   - attaches only for board.consult and brief.generate when memoryContext exists
 *   - stays metadata-only (no raw memory, memoryIds, provenance, secrets)
 *   - shows fallbackReason on Memex fallback without inventing sources
 *   - never mutates fallback memoryContext (enrichment unchanged)
 *
 * Uses local fixtures and mock Memex transport only — no real Memex, MCP, network,
 * secrets, or env dependency. Exits 0 on pass, 1 on fail.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Strip env that could trigger real Memex / Supabase paths during import.
delete process.env.MEMEX_CORE_ROOT;
delete process.env.ORIA_ENABLE_MEMEX_READONLY;
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("[smoke:joris:memex-evidence] mode: LOCAL (fixtures + mock transport only)");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(__dirname, "server-only-stub.mjs"),
  },
});

const summaryMod = await jiti.import(
  path.join(projectRoot, "src/server/joris/memex-memory-evidence-summary.ts"),
);
const contextMod = await jiti.import(
  path.join(projectRoot, "src/server/joris/memex-context-source.ts"),
);
const bridgeMod = await jiti.import(
  path.join(projectRoot, "src/server/mcp/memex-bridge-contract.ts"),
);

const {
  summarizeMemexMemoryEvidence,
  buildMemexMemoryEvidencePreview,
  buildMemexMemoryEvidenceObservabilityPayload,
  withMemexEvidencePreview,
  shouldAttachMemexEvidencePreview,
  MEMEX_EVIDENCE_OBSERVABILITY_LOG_EVENT,
} = summaryMod;
const { enrichJorisMemoryContextWithMemex } = contextMod;
const { MEMEX_V1_READ_ALLOWLIST } = bridgeMod;

const NOW_ISO = "2026-07-04T12:00:00.000Z";
const RAW_BRIEF_TEXT = "SECRET raw librarian brief — never leak in preview";
const RAW_MEMORY_ID = "memex-golden-smoke-memory-id-007";
const RAW_NAMESPACE = "michael.hq.secret.namespace";
const RAW_PROVENANCE_TOOL = "agentmemory_librarian_brief";
const FAKE_SECRET = "sk-live-GOLDEN-SMOKE-SECRET-NEVER-PREVIEW";

/** Golden Memory Evidence Pack fixture — mirrors unit tests, no I/O. */
const GOLDEN_EVIDENCE_PACK = {
  packVersion: 1,
  source: "memex",
  sourceTool: RAW_PROVENANCE_TOOL,
  namespace: RAW_NAMESPACE,
  zone: "human",
  agentZonePolicyReference: null,
  memoryIds: [RAW_MEMORY_ID, FAKE_SECRET],
  provenance: [
    {
      memoryId: RAW_MEMORY_ID,
      sourceTool: RAW_PROVENANCE_TOOL,
      namespace: RAW_NAMESPACE,
      retrievedAtIso: "2026-07-03T20:00:00.000Z",
    },
  ],
  deprecatedExcluded: true,
  trustLevel: "active",
  freshness: {
    oldestIso: "2026-07-03T20:00:00.000Z",
    newestIso: "2026-07-03T20:00:00.000Z",
  },
  conflictPolicy: "exclude_conflicts",
  conflicts: [],
  contextBudget: 4000,
  injectedCharCount: 42,
  redactionsApplied: 0,
  routingHintAdvisoryOnly: true,
  oriaAuthority: true,
  createdAtIso: "2026-07-03T20:00:00.000Z",
};

const GOLDEN_ENRICHED_SUMMARY = summarizeMemexMemoryEvidence({
  evidencePack: GOLDEN_EVIDENCE_PACK,
  trace: {
    status: "enriched",
    reason: `injected with ${RAW_BRIEF_TEXT}`,
    handshakeOk: true,
    evidencePackValid: true,
  },
  nowIso: NOW_ISO,
});

const GOLDEN_FALLBACK_SUMMARY = summarizeMemexMemoryEvidence({
  evidencePack: null,
  trace: {
    status: "fallback",
    reason: "empty or invalid Memex selection",
    handshakeOk: true,
    evidencePackValid: false,
  },
  nowIso: NOW_ISO,
});

const VAULT_MEMORY_CONTEXT = "Verified vault note\n\nLessons rail block";

const FORBIDDEN_IN_PREVIEW = [
  RAW_BRIEF_TEXT,
  RAW_MEMORY_ID,
  RAW_NAMESPACE,
  RAW_PROVENANCE_TOOL,
  FAKE_SECRET,
  "sk-live-",
  "memoryIds",
  "provenance",
  "namespace:",
  "michael.hq",
];

function previewHasNoSensitiveLeak(preview) {
  const violations = FORBIDDEN_IN_PREVIEW.filter((needle) => preview.includes(needle));
  return violations;
}

function runGoldenScenario(name, fn) {
  try {
    const pass = fn();
    return { name, pass, error: pass ? null : "assertion failed" };
  } catch (err) {
    return { name, pass: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const mockOkTransport = {
  listTools: async () => [...MEMEX_V1_READ_ALLOWLIST],
  callTool: async () => RAW_BRIEF_TEXT,
  close: async () => {},
};

const mockFallbackTransport = {
  listTools: async () => [...MEMEX_V1_READ_ALLOWLIST],
  callTool: async () => "",
  close: async () => {},
};

/** Enrichment with mock transport — deterministic, no network. */
const enrichedEnrichment = await enrichJorisMemoryContextWithMemex({
  existingContext: VAULT_MEMORY_CONTEXT,
  taskIntent: "golden smoke board consult",
  workspaceId: "golden-smoke-ws",
  transport: mockOkTransport,
  env: { MEMEX_CORE_ROOT: "/golden-smoke-fixture" },
  nowIso: NOW_ISO,
});

const fallbackEnrichment = await enrichJorisMemoryContextWithMemex({
  existingContext: VAULT_MEMORY_CONTEXT,
  taskIntent: "golden smoke fallback",
  workspaceId: "golden-smoke-ws",
  transport: mockFallbackTransport,
  env: { MEMEX_CORE_ROOT: "/golden-smoke-fixture" },
  nowIso: NOW_ISO,
});

const scenarios = [
  runGoldenScenario("board.consult + enriched memoryContext → preview present", () => {
    const base = "Board consult response summary";
    const out = withMemexEvidencePreview(base, {
      intent: "board.consult",
      memoryContext: enrichedEnrichment.memoryContext,
      evidenceSummary: enrichedEnrichment.evidenceSummary,
    });
    return (
      out !== base &&
      out.includes("Memex Evidence Preview") &&
      out.includes("sourceCount: 1") &&
      out.includes("read-only")
    );
  }),

  runGoldenScenario("brief.generate + enriched memoryContext → preview present", () => {
    const base = "CEO brief headline and focus";
    const out = withMemexEvidencePreview(base, {
      intent: "brief.generate",
      memoryContext: enrichedEnrichment.memoryContext,
      evidenceSummary: enrichedEnrichment.evidenceSummary,
    });
    return (
      out !== base &&
      out.includes("Memex Evidence Preview") &&
      out.includes("confidence: medium") &&
      out.includes("no execution authorized")
    );
  }),

  runGoldenScenario("Memex fallback → preview shows fallbackReason, sourceCount 0", () => {
    const base = "Fallback path summary";
    const out = withMemexEvidencePreview(base, {
      intent: "board.consult",
      memoryContext: fallbackEnrichment.memoryContext,
      evidenceSummary: fallbackEnrichment.evidenceSummary,
    });
    return (
      out.includes("sourceCount: 0") &&
      out.includes("confidence: none") &&
      out.includes("empty or invalid Memex selection") &&
      fallbackEnrichment.evidenceSummary.sourceCount === 0
    );
  }),

  runGoldenScenario("Memex fallback → memoryContext unchanged (not modified)", () => {
    return (
      fallbackEnrichment.memoryContext === VAULT_MEMORY_CONTEXT &&
      fallbackEnrichment.trace.status === "fallback"
    );
  }),

  runGoldenScenario("unauthorized intent (calendar.book) → no preview added", () => {
    const base = "Calendar booking summary";
    const out = withMemexEvidencePreview(base, {
      intent: "calendar.book",
      memoryContext: enrichedEnrichment.memoryContext,
      evidenceSummary: enrichedEnrichment.evidenceSummary,
    });
    return out === base && shouldAttachMemexEvidencePreview("calendar.book", VAULT_MEMORY_CONTEXT) === false;
  }),

  runGoldenScenario("memoryContext absent → no preview added", () => {
    const base = "No vault context summary";
    const out = withMemexEvidencePreview(base, {
      intent: "board.consult",
      memoryContext: null,
      evidenceSummary: GOLDEN_ENRICHED_SUMMARY,
    });
    return out === base && shouldAttachMemexEvidencePreview("board.consult", null) === false;
  }),

  runGoldenScenario("preview metadata-only — enriched (no leaks)", () => {
    const preview = buildMemexMemoryEvidencePreview(GOLDEN_ENRICHED_SUMMARY);
    return previewHasNoSensitiveLeak(preview).length === 0;
  }),

  runGoldenScenario("preview metadata-only — fallback (no leaks)", () => {
    const preview = buildMemexMemoryEvidencePreview(GOLDEN_FALLBACK_SUMMARY);
    return previewHasNoSensitiveLeak(preview).length === 0;
  }),

  runGoldenScenario("joris.memex.summary log payload is compact and log-safe", () => {
    const payload = buildMemexMemoryEvidenceObservabilityPayload({
      summary: GOLDEN_ENRICHED_SUMMARY,
      evidencePackValid: true,
    });
    const serialized = JSON.stringify(payload);
    return (
      MEMEX_EVIDENCE_OBSERVABILITY_LOG_EVENT === "joris.memex.summary" &&
      !serialized.includes(FAKE_SECRET) &&
      !serialized.includes("limitations") &&
      payload.sourceCount === 1 &&
      payload.fallbackReasonCount === 0
    );
  }),

  runGoldenScenario("enriched enrichment augments memoryContext; fallback does not", () => {
    return (
      enrichedEnrichment.trace.status === "enriched" &&
      enrichedEnrichment.memoryContext !== VAULT_MEMORY_CONTEXT &&
      enrichedEnrichment.memoryContext.includes(VAULT_MEMORY_CONTEXT) &&
      fallbackEnrichment.memoryContext === VAULT_MEMORY_CONTEXT
    );
  }),
];

console.log("[smoke:joris:memex-evidence] golden scenarios:");
const failed = [];
for (const result of scenarios) {
  const tag = result.pass ? "ok" : "fail";
  console.log(`  [${tag}] ${result.name}`);
  if (!result.pass) {
    failed.push(result);
    if (result.error) {
      console.log(`         ${result.error}`);
    }
  }
}

if (failed.length > 0) {
  console.error(`[smoke:joris:memex-evidence] FAIL — ${failed.length} scenario(s) failed`);
  process.exit(1);
}

console.log("[smoke:joris:memex-evidence] PASS — all golden scenarios green");
process.exit(0);
