import type { WorkspaceContext } from "@/core/workspace-context";
import type { ModelMode } from "@/core/types";
import type { LedgerEventType, SkillProfile } from "@/core/types";
import type { Json } from "@/server/db/types";
import { createActionLedgerRepository, type ActionLedgerEntry } from "./action-ledger-repository";

export const LEDGER_EVENT_TYPES = [
  "decision",
  "action",
  "result",
  "cost",
  "learning",
] as const satisfies readonly LedgerEventType[];

export type LedgerEffectKind =
  | "db_write"
  | "external_call"
  | "schedule"
  | "mission_transition"
  | "notification"
  | "runtime_result";

export type LedgerEffectOperation =
  | "create"
  | "update"
  | "delete"
  | "send"
  | "execute"
  | "plan";

export type LedgerEventPayload = {
  eventType: LedgerEventType;
  actionType: string;
  summary: string;
  autonomyLevel: number;
  requiresConfirmation: boolean;
  workspaceId: string;
  modeId?: string;
  skillId?: string;
  agentId?: string;
  missionId?: string;
  modelId?: string;
  costMode?: ModelMode;
  effect: {
    kind: LedgerEffectKind;
    operation: LedgerEffectOperation;
    target?: string;
  };
  metadata?: Record<string, unknown>;
};

export type LedgerEventValidationCode =
  | "INVALID_LEDGER_EVENT_TYPE"
  | "INVALID_LEDGER_FIELD"
  | "INVALID_LEDGER_METADATA"
  | "SENSITIVE_LEDGER_METADATA"
  | "SKILL_LEDGER_REQUIRED"
  | "SKILL_LEDGER_EVENT_NOT_ALLOWED"
  | "SKILL_LEDGER_MISMATCH";

export class LedgerEventValidationError extends Error {
  constructor(
    message: string,
    public readonly code: LedgerEventValidationCode,
  ) {
    super(message);
    this.name = "LedgerEventValidationError";
  }
}

const REQUIRED_EFFECT_FIELDS: readonly (keyof LedgerEventPayload["effect"])[] = [
  "kind",
  "operation",
];

const SENSITIVE_KEY_PARTS = [
  "apikey",
  "authorization",
  "body",
  "credential",
  "email",
  "message",
  "password",
  "payload",
  "prompt",
  "secret",
  "token",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LedgerEventValidationError(
      `${fieldName} is required for ledger events.`,
      "INVALID_LEDGER_FIELD",
    );
  }
}

function assertNoSensitiveKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveKeys(item, `${path}[${index}]`));
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part))) {
      throw new LedgerEventValidationError(
        `Ledger metadata field ${path}.${key} is not allowed because it may contain sensitive data.`,
        "SENSITIVE_LEDGER_METADATA",
      );
    }
    assertNoSensitiveKeys(child, `${path}.${key}`);
  }
}

function toJsonValue(value: unknown, path: string): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new LedgerEventValidationError(
        `Ledger metadata field ${path} must be finite.`,
        "INVALID_LEDGER_METADATA",
      );
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => toJsonValue(item, `${path}[${index}]`));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, toJsonValue(child, `${path}.${key}`)]),
    );
  }

  throw new LedgerEventValidationError(
    `Ledger metadata field ${path} must be JSON-serializable.`,
    "INVALID_LEDGER_METADATA",
  );
}

function toJsonRecord(value: Record<string, unknown> | undefined): Record<string, Json> {
  if (!value) return {};
  assertNoSensitiveKeys(value, "metadata");
  return toJsonValue(value, "metadata") as Record<string, Json>;
}

function buildLedgerPayload(event: LedgerEventPayload): Json {
  return {
    effect: {
      kind: event.effect.kind,
      operation: event.effect.operation,
      ...(event.effect.target ? { target: event.effect.target } : {}),
    },
    ...(event.modeId ? { modeId: event.modeId } : {}),
    ...(event.metadata ? { metadata: toJsonRecord(event.metadata) } : {}),
  };
}

export function isEffectfulSkill(
  skill: Pick<SkillProfile, "canTriggerExternal" | "canWriteDB" | "sideEffects">,
): boolean {
  return (
    skill.canWriteDB ||
    skill.canTriggerExternal ||
    skill.sideEffects === "reversible-write" ||
    skill.sideEffects === "irreversible-external"
  );
}

export function validateLedgerEventPayload(event: LedgerEventPayload): void {
  if (!LEDGER_EVENT_TYPES.includes(event.eventType)) {
    throw new LedgerEventValidationError(
      `Unknown ledger event type: ${event.eventType}`,
      "INVALID_LEDGER_EVENT_TYPE",
    );
  }

  assertNonEmptyString(event.actionType, "actionType");
  assertNonEmptyString(event.summary, "summary");
  assertNonEmptyString(event.workspaceId, "workspaceId");

  if (!Number.isInteger(event.autonomyLevel) || event.autonomyLevel < 0 || event.autonomyLevel > 5) {
    throw new LedgerEventValidationError(
      "autonomyLevel must be an integer between 0 and 5.",
      "INVALID_LEDGER_FIELD",
    );
  }

  if (typeof event.requiresConfirmation !== "boolean") {
    throw new LedgerEventValidationError(
      "requiresConfirmation must be a boolean.",
      "INVALID_LEDGER_FIELD",
    );
  }

  if (!isPlainObject(event.effect)) {
    throw new LedgerEventValidationError(
      "effect is required for ledger events.",
      "INVALID_LEDGER_FIELD",
    );
  }

  for (const field of REQUIRED_EFFECT_FIELDS) {
    assertNonEmptyString(event.effect[field], `effect.${field}`);
  }

  if (event.effect.target !== undefined) {
    assertNonEmptyString(event.effect.target, "effect.target");
  }

  toJsonRecord(event.metadata);
}

export function requireLedgerForEffectfulSkill(
  skill: SkillProfile,
  event?: Pick<LedgerEventPayload, "agentId" | "eventType" | "missionId" | "skillId" | "workspaceId">,
  options: { missionIdRequired?: boolean } = {},
): void {
  if (!isEffectfulSkill(skill)) return;

  if (!event) {
    throw new LedgerEventValidationError(
      `Effectful skill ${skill.id} requires a ledger event.`,
      "SKILL_LEDGER_REQUIRED",
    );
  }

  if (!skill.logsRequired.includes(event.eventType)) {
    throw new LedgerEventValidationError(
      `Skill ${skill.id} does not allow ledger event type ${event.eventType}.`,
      "SKILL_LEDGER_EVENT_NOT_ALLOWED",
    );
  }

  if (event.skillId !== skill.id) {
    throw new LedgerEventValidationError(
      `Ledger event skillId must match ${skill.id}.`,
      "SKILL_LEDGER_MISMATCH",
    );
  }

  assertNonEmptyString(event.workspaceId, "workspaceId");
  assertNonEmptyString(event.agentId, "agentId");

  if (options.missionIdRequired) {
    assertNonEmptyString(event.missionId, "missionId");
  }
}

export async function recordLedgerEvent(
  ctx: WorkspaceContext,
  event: LedgerEventPayload,
  options: {
    skill?: SkillProfile;
    missionIdRequired?: boolean;
  } = {},
): Promise<ActionLedgerEntry> {
  validateLedgerEventPayload(event);

  if (event.workspaceId !== ctx.workspace.id) {
    throw new LedgerEventValidationError(
      "Ledger event workspaceId must match the active workspace context.",
      "INVALID_LEDGER_FIELD",
    );
  }

  if (options.skill) {
    requireLedgerForEffectfulSkill(options.skill, event, {
      missionIdRequired: options.missionIdRequired,
    });
  }

  const repository = createActionLedgerRepository(ctx);

  return repository.record({
    actionType: event.actionType,
    eventType: event.eventType,
    summary: event.summary,
    autonomyLevel: event.autonomyLevel,
    requiresConfirmation: event.requiresConfirmation,
    modelId: event.modelId,
    costMode: event.costMode,
    workspaceId: event.workspaceId,
    skillId: event.skillId,
    agentId: event.agentId,
    missionId: event.missionId,
    payload: buildLedgerPayload(event),
    metadata: {
      eventType: event.eventType,
      workspaceId: event.workspaceId,
      ...(event.modeId ? { modeId: event.modeId } : {}),
      ...(event.skillId ? { skillId: event.skillId } : {}),
      ...(event.agentId ? { agentId: event.agentId } : {}),
      ...(event.missionId ? { missionId: event.missionId } : {}),
    },
  });
}
