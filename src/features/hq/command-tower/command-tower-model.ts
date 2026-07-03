// src/features/hq/command-tower/command-tower-model.ts
//
// Command Tower v1 — pure view-model assembly for the /hq daily dispatch
// cockpit (design: docs/COMMAND_TOWER_V1.md). Composition only: every input
// comes from an already-merged engine; this module has no I/O, no clock, no
// side effects. The server component fetches, this module decides what is
// honestly displayable.
//
// Honest-state rules encoded here:
//   - A runtime is never "ready" without probe evidence. Probe-backed entries
//     (Local Runtime Probe v1) may claim it only with citeable evidence; the
//     static fallback board still cannot express readiness at all.
//   - Detection is not permission: a probe-backed "ready" changes NOTHING on
//     the dispatch board — corridors stay approval-gated futures.
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
  | "installed_unverified"
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

/** Statuses only a probe may claim — and only with citeable evidence. */
const PROBE_EVIDENCE_REQUIRED_STATUSES: readonly RuntimeDispatchStatus[] = [
  "ready",
  "installed_unverified",
];

export type RuntimeBoardEntry = {
  id: "claude_code_cli" | "codex_cli" | "gemini_cli" | "zapier_mcp";
  label: string;
  status: RuntimeDispatchStatus;
  /** Grounding for the status claim (capability-status idiom). */
  evidence: string;
  note: string;
  /** Present only on probe-backed entries — the proof behind the status. */
  probe?: { probedAtIso: string; version: string | null } | null;
};

/**
 * Static FALLBACK runtime board, shown only when the Local Runtime Probe v1
 * did not return a result for this render. Without probe evidence nothing
 * here may claim "ready" — the model validator enforces it, the test pins it.
 */
export const RUNTIME_STATUS_BOARD: readonly RuntimeBoardEntry[] = [
  {
    id: "claude_code_cli",
    label: "Claude Code CLI",
    status: "unavailable",
    evidence: "Local Runtime Probe v1 did not return a result for this render",
    note: "Probe indisponible — statut par défaut sans preuve, jamais un faux ready.",
  },
  {
    id: "codex_cli",
    label: "Codex CLI",
    status: "unavailable",
    evidence: "Local Runtime Probe v1 did not return a result for this render",
    note: "Probe indisponible — statut par défaut sans preuve, jamais un faux ready.",
  },
  {
    id: "gemini_cli",
    label: "Gemini CLI",
    status: "unavailable",
    evidence: "Local Runtime Probe v1 did not return a result for this render",
    note: "Probe indisponible — statut par défaut sans preuve.",
  },
  {
    id: "zapier_mcp",
    label: "Zapier MCP",
    status: "future_tool_corridor",
    evidence: "Not probed — tool corridor, no live call in v1 (Runtime Gate analysis)",
    note: "Corridor d'outils futur — dry-run d'abord, jamais le cerveau.",
  },
];

export type DispatchCorridorMode =
  | "governed_live"
  | "blocked_until_dispatch_mandate"
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
    mode: "blocked_until_dispatch_mandate",
    requiresApproval: true,
    action: null,
    note: "Détectable via le probe v1, mais le corridor de dispatch reste un futur PR — détection ≠ permission.",
  },
  {
    id: "codex_cli",
    label: "Codex CLI",
    mode: "blocked_until_dispatch_mandate",
    requiresApproval: true,
    action: null,
    note: "Détectable via le probe v1, mais le corridor de dispatch reste un futur PR — détection ≠ permission.",
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

/** Probe-backed runtime board input, produced by the runtime status source. */
export type RuntimeBoardInput = {
  entries: readonly RuntimeBoardEntry[];
  probedAtIso: string;
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
  /** Optional so older callers/tests keep working; absent = probe unavailable. */
  runtimeBoard?: RuntimeBoardInput | null;
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
    /** "probe_v1" = statuses derived from real local evidence this render. */
    gate: "probe_v1" | "probe_unavailable";
    probedAtIso: string | null;
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
 * Honest-mapping pass over probe-backed entries: a status that requires probe
 * evidence ("ready", "installed_unverified") is downgraded to "unavailable"
 * when the entry carries no probe proof. Dynamic input degrades, never throws.
 */
function sanitizeProbedBoardEntries(
  entries: readonly RuntimeBoardEntry[],
): readonly RuntimeBoardEntry[] {
  return entries.map((entry) => {
    if (!PROBE_EVIDENCE_REQUIRED_STATUSES.includes(entry.status)) {
      return entry;
    }
    const hasProof =
      entry.probe != null &&
      typeof entry.probe.probedAtIso === "string" &&
      entry.probe.probedAtIso.length > 0 &&
      entry.evidence.trim().length > 0;
    if (hasProof) {
      return entry;
    }
    return {
      ...entry,
      status: "unavailable",
      note: `${entry.note} — déclassé : statut « ${entry.status} » réclamé sans preuve de probe.`,
    };
  });
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

  const runtimeBoard = inputs.runtimeBoard ?? null;

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
    runtimeStatus:
      runtimeBoard === null
        ? { gate: "probe_unavailable", probedAtIso: null, entries: RUNTIME_STATUS_BOARD }
        : {
            gate: "probe_v1",
            probedAtIso: runtimeBoard.probedAtIso,
            entries: sanitizeProbedBoardEntries(runtimeBoard.entries),
          },
    approvalRail: {
      state: intents === null ? "unavailable" : intents.length === 0 ? "empty" : "ready",
      pendingCount,
    },
    parkingLot: PARKING_LOT,
  };
}
