// src/server/ventures/active-venture-contexts.ts
//
// CEO-driven venture sourcing for the cash-action generator. Instead of always
// reasoning about a hard-coded seed, Hermès reasons about the CEO's REAL active
// ventures (the durable ventures table). The static ORYA_VENTURES seed becomes a
// safe fallback, used only when there are no active ventures yet or the
// repository is unavailable (e.g. migration 0009 not applied in prod) — the page
// never crashes and never shows an empty screen.
//
// Pure mappers (card → context, active filter) are exported for testing; the
// async resolver wires the ventures repository and is dependency-injectable.

import type { VentureCard, VentureLifecycleStatus } from "@/features/ventures/types";
import {
  ORYA_VENTURES,
  type VentureContext,
} from "@/features/ventures/llm-cash-action-packet-generator";
import { listVenturesForWorkspace } from "./venture-repository";

// Lifecycle statuses worth preparing cash actions for. Discovered is too early;
// paused / killed / archived are not active work.
export const ACTIVE_VENTURE_STATUSES: ReadonlySet<VentureLifecycleStatus> = new Set([
  "candidate",
  "scored",
  "shortlisted",
  "approved_for_validation",
  "validating",
  "operating",
  "autonomous",
  "scaling",
]);

export function isActiveVenture(card: VentureCard): boolean {
  return ACTIVE_VENTURE_STATUSES.has(card.status);
}

// Map a durable VentureCard to the non-sensitive context the generator consumes.
// Pure and deterministic — no secrets, no scores, just what the agent reasons on.
export function ventureCardToContext(card: VentureCard): VentureContext {
  return {
    ventureId: card.id,
    name: card.name,
    description: card.description,
    targetMarket: card.targetCustomer,
    currentStage: card.status,
  };
}

// Filter to active ventures and project to contexts, preserving input order.
export function selectActiveVentureContexts(cards: readonly VentureCard[]): VentureContext[] {
  return cards.filter(isActiveVenture).map(ventureCardToContext);
}

export type VentureContextSource = "ventures_repo" | "seed";

export type ActiveVentureContextsResult = {
  contexts: VentureContext[];
  source: VentureContextSource;
};

export type ActiveVentureContextsDeps = {
  listVentures: (workspaceId: string) => Promise<VentureCard[]>;
};

function resolveDeps(overrides?: Partial<ActiveVentureContextsDeps>): ActiveVentureContextsDeps {
  return {
    listVentures: overrides?.listVentures ?? listVenturesForWorkspace,
  };
}

// Resolve the venture contexts Hermès should reason about for a workspace.
// Prefers the CEO's real active ventures; falls back to the seed when there are
// none or the repository is unavailable. Never throws.
export async function listActiveVentureContextsForWorkspace(
  workspaceId: string,
  overrides?: Partial<ActiveVentureContextsDeps>,
): Promise<ActiveVentureContextsResult> {
  const deps = resolveDeps(overrides);
  try {
    const cards = await deps.listVentures(workspaceId);
    const contexts = selectActiveVentureContexts(cards);
    if (contexts.length > 0) {
      return { contexts, source: "ventures_repo" };
    }
  } catch {
    // Repository unavailable — fall through to the seed.
  }
  return { contexts: [...ORYA_VENTURES], source: "seed" };
}
