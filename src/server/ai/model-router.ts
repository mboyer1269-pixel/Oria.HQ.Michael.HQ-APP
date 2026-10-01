import type { ModelMode, ModelProfile } from "@/core/types";
import {
  ECONOMY_MODEL_ID,
  LONG_CONTEXT_MODEL_ID,
  PREMIUM_MODEL_ID,
  resolveModelProfile,
} from "@/server/ai/model-config";
import {
  createInMemoryBudgetStore,
  dayKeyOf,
  decideLadder,
  freeModelProfile,
  RUNG_COST_WEIGHT,
  type BudgetStore,
  type CostRung,
  type FreeModelEntry,
  type TaskClass,
} from "@/server/ai/cost-ladder";
import { recordCallAccounting } from "@/server/ai/call-accounting";
import { executionTargetForModel } from "@/server/ai/execution-models";

export type ModelRouteInput = {
  message: string;
  requestedMode?: ModelMode;
  highImpact?: boolean;
  /** Model IDs marked unavailable — router picks the next candidate in the fallback chain. */
  unavailableModelIds?: readonly string[];
  // --- Cost Ladder (P4) — all optional; absence leaves base routing untouched. ---
  /** Task class that engages the Cost Ladder (quality floor + budget guard). */
  taskClass?: TaskClass;
  /** Agent the call is billed to, for the per-agent daily budget. */
  agentId?: string;
  /** Config-driven free-model catalog (only enabled+recommended are used). */
  freeCatalog?: readonly FreeModelEntry[];
  /** Clock for the daily budget bucket; defaults to Date.now(). */
  nowMs?: number;
  /** Override the per-agent daily budget (cost units). */
  dailyBudget?: number;
  /** Override the budget store (defaults to the module in-memory store). */
  budgetStore?: BudgetStore;
  /** Journal scope only. Selection does not bill this workspace. */
  workspaceId?: string;
};

export type BrainRouteVia = "keyword" | "semantic-fallback" | "default" | "cost-ladder";

export type ModelRouteDecision = {
  model: ModelProfile;
  modelId: string;
  /** Same id as `modelId`. Selection never executes a model. */
  chosenModelId: string;
  executedModelId: null;
  /** `refused` means the caller must not send a provider request. */
  execution: "callable" | "refused";
  refusalReason?: string;
  /** Relative ladder weight. Not dollars. Not written to the budget store. */
  estimate: {
    kind: "estimation";
    relativeWeight: number;
    unit: "relative_weight_not_dollars";
    monetaryUsd: null;
  };
  /** chooseModel does not debit, reserve, or observe a provider usage. */
  accountingEffect: "none";
  mode: ModelMode;
  reason: string;
  via: BrainRouteVia;
};

export type DifficultyLevel = "low" | "medium" | "high";

export type RouteDomain =
  | "operational"
  | "strategic"
  | "analytical"
  | "creative"
  | "long-context"
  | "unknown";

export type DifficultyClassification = {
  difficulty: DifficultyLevel;
  domain: RouteDomain;
};

export type BrainRouteRecord = {
  provider: string;
  model: string;
  mode: ModelMode;
  routeReason: string;
  via: BrainRouteVia;
  inputChars: number;
  outputChars?: number;
  timestamp: string;
};

export type BrainRouteSink = (record: BrainRouteRecord) => void;

const strategicSignals = [
  "stratégie",
  "pricing",
  "vente",
  "millionnaire",
  "board",
  "comité",
  "positionnement",
  "négociation",
  "architecture",
  "agent autonome",
];

const longContextSignals = ["document", "résume", "analyse ce fichier", "long", "vault", "sop"];

const analyticalSignals = [
  "analyse",
  "comparer",
  "évaluer",
  "prioriser",
  "décision",
  "trade-off",
  "pourquoi",
  "comment",
];

const creativeSignals = ["rédige", "brainstorm", "idée", "créatif", "pitch"];

const inMemoryBrainRouteLog: BrainRouteRecord[] = [];

let brainRouteSink: BrainRouteSink = (record) => {
  inMemoryBrainRouteLog.push(record);
  if (process.env.NODE_ENV !== "production") {
    console.info("[brain-route]", record);
  }
};

type RouteCandidate = {
  modelId: string;
  mode: ModelMode;
  reason: string;
  via: BrainRouteVia;
  /** Set when this id must not be sent to a provider. */
  refused?: string;
};

/**
 * Semantic difficulty classifier — stub/heuristic for MVP.
 * Extension point for a future LLM-backed classifier (PR5+).
 */
export function classifyDifficulty(message: string): DifficultyClassification {
  const normalized = message.toLowerCase().trim();

  if (longContextSignals.some((signal) => normalized.includes(signal))) {
    return { difficulty: "medium", domain: "long-context" };
  }

  if (strategicSignals.some((signal) => normalized.includes(signal))) {
    return { difficulty: "high", domain: "strategic" };
  }

  if (creativeSignals.some((signal) => normalized.includes(signal))) {
    return { difficulty: "medium", domain: "creative" };
  }

  if (analyticalSignals.some((signal) => normalized.includes(signal))) {
    return { difficulty: "medium", domain: "analytical" };
  }

  if (normalized.length > 400 || (normalized.match(/\?/g)?.length ?? 0) >= 2) {
    return { difficulty: "medium", domain: "analytical" };
  }

  if (normalized.length < 40) {
    return { difficulty: "low", domain: "operational" };
  }

  return { difficulty: "low", domain: "unknown" };
}

function resolveMode(requestedMode: ModelMode, routedMode: ModelMode): ModelMode {
  if (requestedMode === "manual") {
    return "manual";
  }
  return routedMode;
}

function routeByKeywords(input: ModelRouteInput): RouteCandidate | null {
  const message = input.message.toLowerCase();
  const mode = input.requestedMode ?? "auto";

  if (mode === "brute" || input.highImpact || strategicSignals.some((signal) => message.includes(signal))) {
    return {
      modelId: PREMIUM_MODEL_ID,
      mode: resolveMode(mode, "brute"),
      reason: "Demande à fort impact business: on privilégie le jugement et le ton de Joris.",
      via: "keyword",
    };
  }

  if (mode === "economy") {
    return {
      modelId: ECONOMY_MODEL_ID,
      mode: "economy",
      reason: "Mode économie demandé: réponse utile sans consommer le modèle premium.",
      via: "keyword",
    };
  }

  if (longContextSignals.some((signal) => message.includes(signal))) {
    return {
      modelId: LONG_CONTEXT_MODEL_ID,
      mode: "economy",
      reason: "Demande orientée contexte long ou synthèse: Gemini est priorisé pour réduire les coûts.",
      via: "keyword",
    };
  }

  return null;
}

function routeBySemanticFallback(message: string): RouteCandidate {
  const classification = classifyDifficulty(message);

  if (
    classification.difficulty === "high" ||
    classification.domain === "strategic" ||
    classification.domain === "analytical"
  ) {
    return {
      modelId: PREMIUM_MODEL_ID,
      mode: "brute",
      reason: "Demande ambiguë classée comme stratégique ou analytique: modèle premium par défaut.",
      via: "semantic-fallback",
    };
  }

  if (classification.domain === "long-context") {
    return {
      modelId: LONG_CONTEXT_MODEL_ID,
      mode: "economy",
      reason: "Demande ambiguë orientée contexte long: Gemini priorisé.",
      via: "semantic-fallback",
    };
  }

  return {
    modelId: ECONOMY_MODEL_ID,
    mode: "economy",
    reason: "Tâche simple ou opérationnelle: Joris économise le budget IA.",
    via: "default",
  };
}

function applyAvailabilityFallback(
  candidate: RouteCandidate,
  unavailableModelIds: ReadonlySet<string>,
): RouteCandidate {
  if (!unavailableModelIds.has(candidate.modelId)) {
    return candidate;
  }

  return {
    ...candidate,
    refused: `${candidate.modelId} indisponible: refus, aucune substitution payante`,
    reason: `${candidate.reason} (refusé: ${candidate.modelId} indisponible, aucune substitution payante)`,
  };
}

// ---------------------------------------------------------------------------
// Cost Ladder integration (P4). Engaged only when input.taskClass is set, so
// every existing caller routes exactly as before. The ladder governs the cost
// rung (free-first under a quality floor + per-agent daily budget); this layer
// maps the chosen rung back to a concrete model + mode.
// ---------------------------------------------------------------------------

/** Maps a base-router model id to its cost rung (base router never emits free). */
function rungOfModelId(modelId: string): CostRung {
  return modelId === PREMIUM_MODEL_ID ? "premium" : "economy";
}

let defaultBudgetStore: BudgetStore = createInMemoryBudgetStore();

/** Resets the in-memory daily-budget accumulator (tests / new day boundary). */
export function resetLadderBudget(): void {
  defaultBudgetStore = createInMemoryBudgetStore();
}

type LadderRoute = {
  candidate: RouteCandidate;
  /** Set when the ladder picked a concrete free model (skips generic fallback). */
  profile?: ModelProfile;
  /** Relative weight of the rung. Not added to the budget store. */
  relativeWeight: number;
};

function applyCostLadder(
  input: ModelRouteInput,
  baseCandidate: RouteCandidate,
  unavailable: ReadonlySet<string>,
): LadderRoute {
  const taskClass = input.taskClass as TaskClass;
  const agentId = input.agentId ?? "système";
  const store = input.budgetStore ?? defaultBudgetStore;
  const nowMs = input.nowMs ?? Date.now();
  const dayKey = dayKeyOf(nowMs);

  const decision = decideLadder({
    taskClass,
    baseRung: rungOfModelId(baseCandidate.modelId),
    freeCatalog: input.freeCatalog ?? [],
    currentSpend: store.spendOf(agentId, dayKey),
    ...(input.dailyBudget !== undefined ? { dailyBudget: input.dailyBudget } : {}),
  });

  const requested = input.requestedMode ?? "auto";
  let candidate: RouteCandidate;
  let profile: ModelProfile | undefined;
  const relativeWeight = decision.estimatedCost;

  if (decision.rung === "free" && decision.freeModel && unavailable.has(decision.freeModel.id)) {
    candidate = {
      modelId: decision.freeModel.id,
      mode: resolveMode(requested, "economy"),
      reason: `Modèle ${decision.freeModel.id} indisponible. Aucune substitution payante. Poids relatif ${relativeWeight}, qui n'est pas un dollar ni un coût observé.`,
      via: "cost-ladder",
      refused: `${decision.freeModel.id} indisponible`,
    };
    profile = freeModelProfile(decision.freeModel);
  } else if (decision.rung === "free" && decision.freeModel) {
    candidate = {
      modelId: decision.freeModel.id,
      mode: resolveMode(requested, "economy"),
      reason: decision.reason,
      via: "cost-ladder",
    };
    profile = freeModelProfile(decision.freeModel);
  } else if (decision.rung === "premium") {
    candidate = {
      modelId: PREMIUM_MODEL_ID,
      mode: resolveMode(requested, "brute"),
      reason: decision.reason,
      via: "cost-ladder",
    };
  } else if (
    decision.rung === "economy" &&
    rungOfModelId(baseCandidate.modelId) === "economy"
  ) {
    // Keep the base id. Do not replace Gemini, or any other non-premium id,
    // with gpt-4o-mini just because the rung is economy.
    candidate = {
      modelId: baseCandidate.modelId,
      mode: resolveMode(requested, "economy"),
      reason: decision.reason,
      via: "cost-ladder",
    };
  } else {
    candidate = {
      modelId: ECONOMY_MODEL_ID,
      mode: resolveMode(requested, "economy"),
      reason: decision.reason,
      via: "cost-ladder",
    };
  }

  // `store.spendOf` is only a policy input. This function does not add to it.
  return profile ? { candidate, profile, relativeWeight } : { candidate, relativeWeight };
}

export function setBrainRouteSink(sink: BrainRouteSink): void {
  brainRouteSink = sink;
}

export function resetBrainRouteSink(): void {
  brainRouteSink = (record) => {
    inMemoryBrainRouteLog.push(record);
    if (process.env.NODE_ENV !== "production") {
      console.info("[brain-route]", record);
    }
  };
}

export function getBrainRouteLog(): readonly BrainRouteRecord[] {
  return inMemoryBrainRouteLog;
}

export function clearBrainRouteLog(): void {
  inMemoryBrainRouteLog.length = 0;
}

/** Records a routing decision. Interface is persistence-ready for PR5 ledger integration. */
export function recordBrainRoute(
  decision: Pick<ModelRouteDecision, "model" | "modelId" | "mode" | "reason" | "via"> & {
    inputChars: number;
    outputChars?: number;
  },
): BrainRouteRecord {
  const record: BrainRouteRecord = {
    provider: decision.model.provider,
    model: decision.modelId,
    mode: decision.mode,
    routeReason: decision.reason,
    via: decision.via,
    inputChars: decision.inputChars,
    ...(decision.outputChars !== undefined ? { outputChars: decision.outputChars } : {}),
    timestamp: new Date().toISOString(),
  };

  brainRouteSink(record);
  return record;
}

export function chooseModel(input: ModelRouteInput): ModelRouteDecision {
  const unavailable = new Set(input.unavailableModelIds ?? []);
  const keywordRoute = routeByKeywords(input);
  const baseCandidate = keywordRoute ?? routeBySemanticFallback(input.message);

  // Cost Ladder governs only when a task class is supplied (backward-compatible).
  const ladder = input.taskClass ? applyCostLadder(input, baseCandidate, unavailable) : null;

  let resolved: RouteCandidate;
  let model: ModelProfile;
  if (ladder?.profile) {
    resolved = ladder.candidate;
    model = ladder.profile;
  } else {
    resolved = applyAvailabilityFallback(ladder?.candidate ?? baseCandidate, unavailable);
    const known = resolveModelProfile(resolved.modelId);
    model = known ?? {
      id: resolved.modelId,
      label: resolved.modelId,
      provider: "openrouter",
      defaultUse: "Identifiant absent du catalogue: aucun appel et aucune substitution.",
      costTier: "low",
      strengths: [],
    };
    if (!known) {
      resolved = {
        ...resolved,
        refused: resolved.refused ?? `${resolved.modelId} absent du catalogue`,
      };
    }
  }

  const target = executionTargetForModel(resolved.modelId);
  let execution: ModelRouteDecision["execution"] = "callable";
  let refusalReason: string | undefined;
  if (resolved.refused) {
    execution = "refused";
    refusalReason = resolved.refused;
  } else if (!target.callable) {
    execution = "refused";
    refusalReason = target.reason;
  }

  const relativeWeight =
    ladder?.relativeWeight ??
    (resolved.modelId === PREMIUM_MODEL_ID ? RUNG_COST_WEIGHT.premium : RUNG_COST_WEIGHT.economy);

  const decision: ModelRouteDecision = {
    model,
    modelId: model.id,
    chosenModelId: model.id,
    executedModelId: null,
    execution,
    ...(refusalReason ? { refusalReason } : {}),
    estimate: {
      kind: "estimation",
      relativeWeight,
      unit: "relative_weight_not_dollars",
      monetaryUsd: null,
    },
    accountingEffect: "none",
    mode: resolved.mode,
    reason: resolved.reason,
    via: resolved.via,
  };

  recordCallAccounting({
    kind: "estimation",
    workspaceId: input.workspaceId ?? "unscoped",
    ...(input.agentId ? { agentId: input.agentId } : {}),
    chosenModelId: decision.chosenModelId,
    executedModelId: null,
    relativeWeight,
    monetaryUsd: null,
    networkRequestSent: false,
    note: "Sélection uniquement. Le poids relatif n'est pas un dollar et n'est pas ajouté au budget.",
  });

  recordBrainRoute({
    model: decision.model,
    modelId: decision.modelId,
    mode: decision.mode,
    reason: decision.reason,
    via: decision.via,
    inputChars: input.message.length,
  });

  return decision;
}
