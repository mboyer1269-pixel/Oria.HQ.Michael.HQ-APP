// src/features/hq/command-tower/command-tower-model.ts
//
// Command Tower v1 — pure view-model assembly for the /hq daily dispatch
// cockpit (design: docs/COMMAND_TOWER_V1.md). Composition only: every input
// comes from an already-merged engine; this module has no I/O, no clock, no
// side effects. The server component fetches, this module decides what is
// honestly displayable.
//
// Honest-state rules encoded here:
//   - A runtime is never "ready" without probe evidence. No probe exists on
//     main, so the static board cannot express readiness at all today.
//   - Every dispatch corridor requires CEO approval — the type forbids less.
//   - A failed data source renders "unavailable", never a fake zero.
//   - Cards cap at MAX_QUEUE_ITEMS intents; the rest becomes an overflow count.

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type RuntimeDispatchStatus =
  | "not_configured"
  | "pending"
  | "unavailable"
  | "blocked"
  | "ready"
  | "future_candidate"
  | "future_tool_corridor";

/** Statuses the static registry may claim without probe evidence. */
const STATIC_BOARD_LEGAL_STATUSES: readonly RuntimeDispatchStatus[] = [
  "not_configured",
  "pending",
  "unavailable",
  "blocked",
  "future_candidate",
  "future_tool_corridor",
];

export type RuntimeBoardEntry = {
  id: "claude_code_cli" | "codex_cli" | "gemini_cli" | "zapier_mcp";
  label: string;
  status: RuntimeDispatchStatus;
  /** Grounding for the status claim (capability-status idiom). */
  evidence: string;
  note: string;
};

/**
 * Static, honest runtime board. The Runtime Gate contracts (PR #325) are not
 * on main and no detection probe exists, so nothing here may claim "ready" —
 * the model validator enforces it and the test pins it.
 */
export const RUNTIME_STATUS_BOARD: readonly RuntimeBoardEntry[] = [
  {
    id: "claude_code_cli",
    label: "Claude Code CLI",
    status: "not_configured",
    evidence: "Runtime Gate PR #325 pending merge; no detection probe exists",
    note: "Abonnement personnel, login CLI officiel. Probe de détection = prochain mandat.",
  },
  {
    id: "codex_cli",
    label: "Codex CLI",
    status: "not_configured",
    evidence: "Runtime Gate PR #325 pending merge; no detection probe exists",
    note: "Abonnement personnel, login CLI officiel. Probe de détection = prochain mandat.",
  },
  {
    id: "gemini_cli",
    label: "Gemini CLI",
    status: "future_candidate",
    evidence: "No contract on main; not covered by the Runtime Gate",
    note: "Candidat futur — aucun contrat, aucun mandat.",
  },
  {
    id: "zapier_mcp",
    label: "Zapier MCP",
    status: "future_tool_corridor",
    evidence: "GO-LATER corridor in the Runtime Gate analysis (PR #325)",
    note: "Corridor d'outils futur — dry-run d'abord, jamais le cerveau.",
  },
];

export type DispatchCorridorMode =
  | "governed_live"
  | "blocked_until_probe"
  | "future_corridor";

export type DispatchCorridor = {
  id: string;
  label: string;
  mode: DispatchCorridorMode;
  /** Sentinelle has no opt-out — the literal type forbids anything else. */
  requiresApproval: true;
  /** Present only when the corridor genuinely works today. */
  action: { label: string; href: string } | null;
  note: string;
};

/**
 * The dispatch corridors the tower may show. Exactly one is live today: the
 * n8n execution-intent rail, where "dispatch" means preparing an intent that
 * stays a proposal until the CEO approves it.
 */
export const DISPATCH_CORRIDORS: readonly DispatchCorridor[] = [
  {
    id: "n8n_execution_rail",
    label: "n8n · hermes/task.create",
    mode: "governed_live",
    requiresApproval: true,
    action: { label: "Préparer un intent (requires approval)", href: "/hq/agents" },
    note: "Seul corridor actif. L'intent reste une proposition tant que le CEO n'approuve pas.",
  },
  {
    id: "claude_code_cli",
    label: "Claude Code CLI",
    mode: "blocked_until_probe",
    requiresApproval: true,
    action: null,
    note: "Bloqué tant que le Runtime Gate (#325) n'est pas mergé et qu'aucun probe n'existe.",
  },
  {
    id: "codex_cli",
    label: "Codex CLI",
    mode: "blocked_until_probe",
    requiresApproval: true,
    action: null,
    note: "Bloqué tant que le Runtime Gate (#325) n'est pas mergé et qu'aucun probe n'existe.",
  },
  {
    id: "zapier_mcp",
    label: "Zapier MCP",
    mode: "future_corridor",
    requiresApproval: true,
    action: null,
    note: "Corridor futur — passera par le même rail d'intents, dry-run d'abord.",
  },
];

export type ParkedItem = {
  id: string;
  label: string;
  reason: string;
  evidence: string;
};

/** Mirrors docs/HQ_WIN_PATH_DECISION.md — what is deliberately NOT active. */
export const PARKING_LOT: readonly ParkedItem[] = [
  {
    id: "pr_323_openrouter",
    label: "OpenRouter free-first routing",
    reason: "Contredit la doctrine display_only; attend le registry (#324) + mandat CEO explicite.",
    evidence: "PR #323 · doctrine PR #308",
  },
  {
    id: "pr_319_ooda_wager",
    label: "OodaWager (Decision Fabric)",
    reason: "Draft propre mais sans mandat P3b.",
    evidence: "PR #319",
  },
  {
    id: "pr_298_ui_uplift",
    label: "HQ UI uplift",
    reason: "À remplacer par des PRs plus petits — CI en échec, +4324 lignes.",
    evidence: "PR #298",
  },
  {
    id: "pr_318_ecc_bundle",
    label: "ECC bundle",
    reason: "Config outillage agent, hors produit (règle anti-dispersion).",
    evidence: "PR #318",
  },
];

// ---------------------------------------------------------------------------
// Inputs — narrow structural shapes so the model stays pure and test-friendly
// ---------------------------------------------------------------------------

export type DecisionQueueItem = {
  intentId: string;
  agentId: string;
  skillId: string;
  toolName: string;
  autonomyLevel: number;
  createdAt: string;
};

export type EvidenceItem = {
  id: string;
  summary: string;
  eventType: string | null;
  agentId: string | null;
  createdAt: string;
};

export type TowerNextAction = {
  id: string;
  title: string;
  summary: string;
  priority: string;
  safety: string;
  ctaLabel: string;
  ctaHref: string;
};

/** `null` for a source means the read FAILED — distinct from an empty list. */
export type CommandTowerInputs = {
  pendingIntents: readonly DecisionQueueItem[] | null;
  nextAction: {
    highlighted: TowerNextAction | null;
    isZeroState: boolean;
    totalActions: number;
  } | null;
  evidence: {
    items: readonly EvidenceItem[];
    source: "supabase" | "local";
  } | null;
};

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export const MAX_QUEUE_ITEMS = 3;
export const MAX_EVIDENCE_ITEMS = 5;

export type SectionState = "ready" | "empty" | "unavailable";

export type CommandTowerModel = {
  missionBrief: {
    state: SectionState;
    headline: string;
    nextAction: TowerNextAction | null;
    pendingDecisionCount: number | null;
  };
  decisionQueue: {
    state: SectionState;
    items: readonly DecisionQueueItem[];
    overflowCount: number;
  };
  dispatchBoard: {
    corridors: readonly DispatchCorridor[];
  };
  evidenceFeed: {
    state: SectionState;
    items: readonly EvidenceItem[];
    source: "supabase" | "local" | null;
  };
  runtimeStatus: {
    /** The gate contracts are not on main yet — surfaced, not hidden. */
    gate: "pending_merge";
    entries: readonly RuntimeBoardEntry[];
  };
  approvalRail: {
    state: SectionState;
    pendingCount: number | null;
  };
  parkingLot: readonly ParkedItem[];
};

function buildHeadline(
  pendingCount: number | null,
  nextAction: TowerNextAction | null,
  nextActionUnavailable: boolean,
): string {
  const decisions =
    pendingCount === null
      ? "décisions en attente indisponibles"
      : pendingCount === 0
        ? "aucune décision en attente"
        : `${pendingCount} décision${pendingCount > 1 ? "s" : ""} en attente`;
  const priority = nextActionUnavailable
    ? "prochaine action indisponible"
    : nextAction
      ? `prochaine action : ${nextAction.title}`
      : "aucune action prioritaire — état zéro honnête";
  return `${decisions} · ${priority}`;
}

/**
 * Assembles the tower view-model. Deterministic: same inputs, same output.
 * Never throws on malformed availability — a missing source is a state.
 */
export function buildCommandTowerModel(inputs: CommandTowerInputs): CommandTowerModel {
  for (const entry of RUNTIME_STATUS_BOARD) {
    if (!STATIC_BOARD_LEGAL_STATUSES.includes(entry.status)) {
      // Invariant 1 of the Runtime Gate: no readiness without probe evidence.
      throw new Error(
        `runtime "${entry.id}" claims status "${entry.status}" without probe evidence`,
      );
    }
  }

  const intents = inputs.pendingIntents;
  const pendingCount = intents === null ? null : intents.length;
  const queueItems = intents === null ? [] : intents.slice(0, MAX_QUEUE_ITEMS);

  const next = inputs.nextAction;
  const highlighted = next?.highlighted ?? null;

  const evidence = inputs.evidence;
  const evidenceItems = evidence === null ? [] : evidence.items.slice(0, MAX_EVIDENCE_ITEMS);

  return {
    missionBrief: {
      state: next === null && intents === null ? "unavailable" : "ready",
      headline: buildHeadline(pendingCount, highlighted, next === null),
      nextAction: highlighted,
      pendingDecisionCount: pendingCount,
    },
    decisionQueue: {
      state: intents === null ? "unavailable" : intents.length === 0 ? "empty" : "ready",
      items: queueItems,
      overflowCount: intents === null ? 0 : Math.max(0, intents.length - MAX_QUEUE_ITEMS),
    },
    dispatchBoard: {
      corridors: DISPATCH_CORRIDORS,
    },
    evidenceFeed: {
      state: evidence === null ? "unavailable" : evidence.items.length === 0 ? "empty" : "ready",
      items: evidenceItems,
      source: evidence === null ? null : evidence.source,
    },
    runtimeStatus: {
      gate: "pending_merge",
      entries: RUNTIME_STATUS_BOARD,
    },
    approvalRail: {
      state: intents === null ? "unavailable" : intents.length === 0 ? "empty" : "ready",
      pendingCount,
    },
    parkingLot: PARKING_LOT,
  };
}
