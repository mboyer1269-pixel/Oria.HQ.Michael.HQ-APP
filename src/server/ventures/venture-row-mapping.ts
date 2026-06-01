// src/server/ventures/venture-row-mapping.ts
//
// Pure row <-> VentureCard mapping for the venture persistence layer.
//
// These helpers are side-effect free and own the light validation between the
// DB row shape (snake_case, jsonb columns typed as `Json`) and the TypeScript
// VentureCard contract. They never silently accept a missing required field:
// an invalid row throws VentureMappingError rather than producing a
// half-populated card.

import type {
  VentureCard,
  VentureLifecycleStatus,
  VentureSource,
} from "@/features/ventures/types";
import type { Json, VentureRow } from "@/server/db/types";

export const VENTURE_STATUSES: readonly VentureLifecycleStatus[] = [
  "discovered",
  "candidate",
  "scored",
  "shortlisted",
  "approved_for_validation",
  "validating",
  "operating",
  "autonomous",
  "scaling",
  "paused",
  "killed",
  "archived",
];

export const VENTURE_SOURCES: readonly VentureSource[] = [
  "human_created",
  "agent_suggested",
  "market_scan",
  "imported",
  "reworked_from_old_idea",
];

const STATUS_SET: ReadonlySet<string> = new Set(VENTURE_STATUSES);
const SOURCE_SET: ReadonlySet<string> = new Set(VENTURE_SOURCES);

export class VentureMappingError extends Error {
  constructor(message: string) {
    super(`Venture mapping failed: ${message}`);
    this.name = "VentureMappingError";
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new VentureMappingError(`missing or empty required field "${field}"`);
  }
  return value;
}

function requireStatus(value: unknown): VentureLifecycleStatus {
  if (typeof value !== "string" || !STATUS_SET.has(value)) {
    throw new VentureMappingError(`invalid status "${String(value)}"`);
  }
  return value as VentureLifecycleStatus;
}

function requireSource(value: unknown): VentureSource {
  if (typeof value !== "string" || !SOURCE_SET.has(value)) {
    throw new VentureMappingError(`invalid source "${String(value)}"`);
  }
  return value as VentureSource;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new VentureMappingError(`field "${field}" must be an array`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Builds a full, deterministic DB row from a VentureCard. Pure: no id/timestamp
 * generation — the card already carries its id, createdAt, and updatedAt.
 */
export function mapVentureCardToRow(workspaceId: string, card: VentureCard): VentureRow {
  const ws = requireString(workspaceId, "workspaceId");
  return {
    id: requireString(card.id, "id"),
    workspace_id: ws,
    name: requireString(card.name, "name"),
    description: requireString(card.description, "description"),
    source: requireSource(card.source),
    status: requireStatus(card.status),
    target_customer: requireString(card.targetCustomer, "targetCustomer"),
    problem: requireString(card.problem, "problem"),
    offer: requireString(card.offer, "offer"),
    primary_channel: requireString(card.primaryChannel, "primaryChannel"),
    score: (card.score ?? null) as Json | null,
    validation_plan: (card.validationPlan ?? null) as Json | null,
    autonomy_profile: card.autonomyProfile as unknown as Json,
    assigned_agents: card.assignedAgents as unknown as Json,
    decisions: card.decisions as unknown as Json,
    created_at: requireString(card.createdAt, "createdAt"),
    updated_at: requireString(card.updatedAt, "updatedAt"),
  };
}

/**
 * Builds a VentureCard from a DB row, validating required fields and the
 * status/source whitelists. JSON columns are validated lightly (shape only) and
 * cast to their typed form; the optional `score` is omitted when null.
 */
export function mapRowToVentureCard(row: VentureRow): VentureCard {
  const autonomyProfile = row.autonomy_profile;
  if (!isObject(autonomyProfile) || !Array.isArray(autonomyProfile.rules)) {
    throw new VentureMappingError("autonomy_profile must be an object with a rules array");
  }

  const card: VentureCard = {
    id: requireString(row.id, "id"),
    name: requireString(row.name, "name"),
    description: requireString(row.description, "description"),
    source: requireSource(row.source),
    status: requireStatus(row.status),
    targetCustomer: requireString(row.target_customer, "target_customer"),
    problem: requireString(row.problem, "problem"),
    offer: requireString(row.offer, "offer"),
    primaryChannel: requireString(row.primary_channel, "primary_channel"),
    autonomyProfile: autonomyProfile as unknown as VentureCard["autonomyProfile"],
    assignedAgents: requireArray(
      row.assigned_agents,
      "assigned_agents",
    ) as unknown as VentureCard["assignedAgents"],
    decisions: requireArray(row.decisions, "decisions") as unknown as VentureCard["decisions"],
    createdAt: requireString(row.created_at, "created_at"),
    updatedAt: requireString(row.updated_at, "updated_at"),
  };

  if (row.score !== null && row.score !== undefined) {
    card.score = row.score as unknown as VentureCard["score"];
  }
  if (row.validation_plan !== null && row.validation_plan !== undefined) {
    card.validationPlan = row.validation_plan as unknown as VentureCard["validationPlan"];
  }

  return card;
}
