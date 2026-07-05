import type { ModelMode, ModelProfile } from "@/core/types";
import {
  ECONOMY_MODEL_ID,
  LONG_CONTEXT_MODEL_ID,
  PREMIUM_MODEL_ID,
  pickAvailableModelId,
  resolveModelProfileOrFallback,
} from "@/server/ai/model-config";
import {
  createInMemoryBudgetStore,
  dayKeyOf,
  decideLadder,
  freeModelProfile,
  recordLadderCost,
  RUNG_COST_WEIGHT,
  type BudgetStore,
  type CostRung,
  type FreeModelEntry,
  type TaskClass,
} from "@/server/ai/cost-ladder";

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
};

export type BrainRouteVia = "keyword" | "semantic-fallback" | "default" | "cost-ladder";

export type ModelRouteDecision = {
  model: ModelProfile;
  modelId: string;
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
  const resolvedId = pickAvailableModelId(candidate.modelId, unavailableModelIds);
  if (resolvedId === candidate.modelId) {
    return candidate;
  }

  return {
    ...candidate,
    modelId: resolvedId,
    reason: `${candidate.reason} (fallback: ${candidate.modelId} indisponible → ${resolvedId})`,
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

  // Respect the router's unavailable set before committing to a free model.
  let rung = decision.rung;
  let freeModel = decision.freeModel;
  if (rung === "free" && freeModel && unavailable.has(freeModel.id)) {
    rung = "economy";
    freeModel = undefined;
  }

  const estimatedCost =
    rung === decision.rung ? decision.estimatedCost : RUNG_COST_WEIGHT.economy;
  store.add(agentId, dayKey, estimatedCost);

  const requested = input.requestedMode ?? "auto";
  let candidate: RouteCandidate;
  let profile: ModelProfile | undefined;

  if (rung === "free" && freeModel) {
    candidate = {
      modelId: freeModel.id,
      mode: resolveMode(requested, "economy"),
      reason: decision.reason,
      via: "cost-ladder",
    };
    profile = freeModelProfile(freeModel);
  } else if (rung === "premium") {
    candidate = {
      modelId: PREMIUM_MODEL_ID,
      mode: resolveMode(requested, "brute"),
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

  recordLadderCost({
    agentId,
    taskClass,
    rung,
    modelId: candidate.modelId,
    estimatedCost,
    floorBound: decision.floorBound,
    budgetBound: decision.budgetBound,
    timestamp: new Date(nowMs).toISOString(),
  });

  return profile ? { candidate, profile } : { candidate };
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
    // Concrete free model: availability already handled inside the ladder.
    resolved = ladder.candidate;
    model = ladder.profile;
  } else {
    resolved = applyAvailabilityFallback(ladder?.candidate ?? baseCandidate, unavailable);
    model = resolveModelProfileOrFallback(resolved.modelId);
  }

  const decision: ModelRouteDecision = {
    model,
    modelId: model.id,
    mode: resolved.mode,
    reason: resolved.reason,
    via: resolved.via,
  };

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
