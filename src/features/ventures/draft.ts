import { getDefaultSafeAutonomyProfile } from "./autonomy";
import type { VentureCard, VentureValidationPlan } from "./types";

/**
 * Identifier prefix for locally created draft venture cards.
 *
 * Cards built by {@link createLocalDraftVentureCard} are browser-only previews.
 * They are NEVER persisted to a database, Supabase, or any server store. The
 * prefix lets the UI distinguish a non-persistent draft from a server-provided
 * seed card.
 */
export const LOCAL_DRAFT_VENTURE_ID_PREFIX = "venture-local-draft-";

/** Human-facing label that must accompany every locally created draft card. */
export const LOCAL_DRAFT_VENTURE_LABEL = "Brouillon local — non persistant";

export type LocalDraftVentureInput = {
  name: string;
  description: string;
  targetCustomer: string;
  problem: string;
  offer: string;
  primaryChannel: string;
  hypothesis: string;
  validationWindowDays: 7 | 30 | 60 | 90;
  budgetCapCents: number;
  firstSuccessMetric: string;
  firstKillMetric: string;
  firstKillThreshold: string;
  /** Optional explicit id (used for deterministic tests). */
  id?: string;
  /** Optional explicit ISO timestamp (used for deterministic tests). */
  now?: string;
};

export function isLocalDraftVentureCard(card: VentureCard): boolean {
  return card.id.startsWith(LOCAL_DRAFT_VENTURE_ID_PREFIX);
}

function generateDraftId(): string {
  const hasRandomUuid =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function";
  const suffix = hasRandomUuid
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return `${LOCAL_DRAFT_VENTURE_ID_PREFIX}${suffix}`;
}

function nonEmpty(value: string): string {
  return value.trim();
}

/**
 * Build a non-persistent, browser-only venture card from CEO intake input.
 *
 * The result is a local draft preview only:
 * - status is always `candidate` (never auto-promoted to validation/active)
 * - source is always `human_created`
 * - the default safe autonomy profile is applied, so risky domains (spending,
 *   externalComms, publishing, dataMutation, legalCommitment) stay approval
 *   gated and no execution is authorized
 * - `assignedAgents` and `decisions` are empty (nothing is set in motion)
 *
 * This is a pure function with no side effects and no I/O.
 */
export function createLocalDraftVentureCard(input: LocalDraftVentureInput): VentureCard {
  const now = input.now ?? new Date().toISOString();
  const id = input.id ?? generateDraftId();

  const windowDays = input.validationWindowDays;
  const budgetCapCents = Number.isFinite(input.budgetCapCents)
    ? Math.max(0, Math.trunc(input.budgetCapCents))
    : 0;

  const successMetric = nonEmpty(input.firstSuccessMetric);
  const killMetric = nonEmpty(input.firstKillMetric);
  const killThreshold = nonEmpty(input.firstKillThreshold);

  const validationPlan: VentureValidationPlan = {
    windowDays,
    hypothesis: nonEmpty(input.hypothesis),
    successMetrics: successMetric ? [successMetric] : [],
    budgetCapCents,
    requiredEvidence: [],
    killCriteria: killMetric
      ? [
          {
            id: `${id}-kill-1`,
            metric: killMetric,
            threshold: killThreshold || "à définir",
            evaluationWindowDays: windowDays,
            // Drafts never auto-kill: a human reviews first.
            consequence: "manual_review",
          },
        ]
      : [],
  };

  return {
    id,
    name: nonEmpty(input.name),
    description: nonEmpty(input.description),
    source: "human_created",
    status: "candidate",
    targetCustomer: nonEmpty(input.targetCustomer),
    problem: nonEmpty(input.problem),
    offer: nonEmpty(input.offer),
    primaryChannel: nonEmpty(input.primaryChannel),
    // No fabricated score: a draft is unscored until the CEO scores it.
    score: undefined,
    validationPlan,
    autonomyProfile: getDefaultSafeAutonomyProfile(),
    assignedAgents: [],
    decisions: [],
    createdAt: now,
    updatedAt: now,
  };
}
