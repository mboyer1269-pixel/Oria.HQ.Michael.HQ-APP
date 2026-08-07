// src/core/runtime-capability-inventory.ts
//
// The central inventory of what this runtime can ACTUALLY do — every executor
// that exists, the effect it produces, and the gate that stands in front of it.
//
// Why it replaced the previous detection
// --------------------------------------
// The cockpit used to conclude "Runtime verrouillé" from a single marker in
// src/server/ventures/shadow-pass.ts ("it executes nothing"). That is a claim
// about ONE agent. It stayed true while an unrelated executor — the green-lane
// content.generate handler, which calls a model API over the network — shipped
// and became reachable. A guard that watches one file cannot notice an executor
// added to another, so the screen kept saying "locked" about a runtime that was
// not.
//
// The inventory is hand-authored and evidence-bearing, like the control-chain
// posture: each entry names a file and a marker that must still be present for
// the claim to hold. What makes it non-rotting is the companion test, which
// walks the real executor registries (built-in skill handlers, MCP tools) and
// fails when one of them has no entry here. Adding an executor without
// declaring it breaks CI; it can no longer reach production unannounced.
//
// Pure data. No imports, no I/O — the cockpit renders it, the test verifies it.

/** What actually happens when a capability runs. */
export type RuntimeEffect =
  | "none" // computes and returns; nothing leaves the process
  | "internal_write" // writes to our own store (ledger, tables)
  | "external_call"; // reaches a third party over the network

/** What must clear before a capability can run. */
export type RuntimeGate =
  | "ceo_approval" // an explicit human approval on a queued intent
  | "sentinelle_green_lane" // an owner-authenticated request the Sentinelle zones green
  | "scheduled_pass"; // a background pass, no per-action human decision

export type RuntimeCapabilityEvidence = {
  /** Repo-relative file that proves the capability exists as described. */
  path: string;
  /** Substring that must appear in that file. */
  mustContain: string;
  /** Why this proves it — read by whoever hits the failure. */
  because: string;
};

export type RuntimeCapability = {
  id: string;
  label: string;
  /** The executor registry key this maps to (skill id, MCP tool name…). */
  executorKey: string;
  effect: RuntimeEffect;
  gate: RuntimeGate;
  detail: string;
  evidence: RuntimeCapabilityEvidence;
};

/**
 * Every executor reachable in this runtime today.
 *
 * Order is by decreasing consequence, so the most effectful capability is the
 * first thing an operator reads.
 */
export const RUNTIME_CAPABILITIES: readonly RuntimeCapability[] = [
  {
    id: "n8n_webhook_dispatch",
    label: "Dispatch n8n (rail d'intents)",
    executorKey: "n8n_webhook_trigger",
    effect: "external_call",
    gate: "ceo_approval",
    detail:
      "Envoi HMAC signé vers n8n. Déclenché uniquement par la route d'approbation CEO — jamais par l'évaluation automatique.",
    evidence: {
      path: "src/app/api/agents/execution-intents/[intentId]/approve/route.ts",
      mustContain: "tool.handler(intent.payload",
      because:
        "The approve route is the only caller of the dispatch tool. If another file starts invoking it, this gate is no longer ceo_approval.",
    },
  },
  {
    id: "green_lane_content_generate",
    label: "Green lane · content.generate",
    executorKey: "content.generate",
    effect: "external_call",
    gate: "sentinelle_green_lane",
    detail:
      "Handler in-process qui appelle une API de modèle (Anthropic/OpenAI). Passe par la Sentinelle et le ledger, PAS par le rail d'approbation.",
    evidence: {
      path: "src/server/runtime/skill-dispatcher.ts",
      mustContain: '"content.generate": handleContentGenerate',
      because:
        "The built-in handler map is what makes this skill execute instead of previewing. Remove the entry and the capability is gone.",
    },
  },
  {
    id: "green_lane_dry_run_preview",
    label: "Green lane · aperçu dry-run",
    executorKey: "*",
    effect: "none",
    gate: "sentinelle_green_lane",
    detail:
      "Toute compétence sans handler in-process retourne un aperçu. Aucun effet, aucun appel sortant.",
    evidence: {
      path: "src/server/runtime/skill-dispatcher.ts",
      mustContain: 'strategy: "dry-run"',
      because:
        "The fallback strategy is what keeps an unimplemented skill inert rather than erroring or improvising.",
    },
  },
  {
    id: "shadow_pass_proposal",
    label: "Mode Ombre · propositions",
    executorKey: "shadow_pass",
    effect: "internal_write",
    gate: "scheduled_pass",
    detail:
      "Propose et journalise des scores de ventures. N'agit pas : l'écriture reste interne au ledger.",
    evidence: {
      path: "src/server/ventures/shadow-pass.ts",
      mustContain: "it executes nothing",
      because:
        "The shadow pass declares itself execution-free. It is one capability among several — never read it as the state of the whole runtime.",
    },
  },
];

// ---------------------------------------------------------------------------
// Derived posture
// ---------------------------------------------------------------------------

/**
 * How much the runtime can do without a human decision per action.
 *
 *   locked  — nothing reachable produces an effect.
 *   gated   — effects exist, and every one of them waits for a CEO approval.
 *   bounded — an effect can occur without traversing the approval rail. Still
 *             owner-authenticated, Sentinelle-zoned and ledger-recorded, but
 *             "verrouillé" would be a false claim.
 */
export type RuntimePostureState = "locked" | "gated" | "bounded";

export type RuntimePosture = {
  state: RuntimePostureState;
  /** Short label for the cockpit pill. */
  meta: string;
  /** One sentence naming what produced the state. */
  detail: string;
  /** Capabilities that produce an effect, most consequential first. */
  effectful: readonly RuntimeCapability[];
  /** Effectful capabilities that do NOT require a CEO approval. */
  ungatedEffects: readonly RuntimeCapability[];
};

/**
 * Derives the runtime posture from the inventory. Pure and total: it reports
 * what the entries say, and cannot express a state the entries do not support.
 */
export function deriveRuntimePosture(
  capabilities: readonly RuntimeCapability[] = RUNTIME_CAPABILITIES,
): RuntimePosture {
  const effectful = capabilities.filter((capability) => capability.effect !== "none");
  const ungatedEffects = effectful.filter((capability) => capability.gate !== "ceo_approval");

  if (effectful.length === 0) {
    return {
      state: "locked",
      meta: "Verrouillé",
      detail: "Aucun exécuteur inventorié ne produit d'effet.",
      effectful,
      ungatedEffects,
    };
  }

  if (ungatedEffects.length === 0) {
    return {
      state: "gated",
      meta: "Sous approbation",
      detail: `${effectful.length} exécuteur(s) à effet, tous derrière une approbation CEO explicite.`,
      effectful,
      ungatedEffects,
    };
  }

  return {
    state: "bounded",
    meta: "Borné",
    detail:
      `${ungatedEffects.length} exécuteur(s) à effet hors du rail d'approbation ` +
      `(${ungatedEffects.map((capability) => capability.label).join(", ")}) — ` +
      "authentifiés propriétaire, zonés par la Sentinelle et journalisés, mais sans paquet d'approbation.",
    effectful,
    ungatedEffects,
  };
}
