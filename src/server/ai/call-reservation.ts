import "server-only";

import type { Json } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { executionTargetForModel } from "@/server/ai/execution-models";

/**
 * Budget contract for one HQ provider attempt. Routing weights are not part of it.
 *
 * Unit: integer USD cents. `relativeWeight` (0, 1, 5) stays a routing metric on
 * `chooseModel` and is never stored, summed, or converted here.
 *
 * A budgeted send needs both of these server rows, never a client field:
 *   - `hq_call_budget_ceiling`: workspace cap in USD cents
 *   - `hq_call_budget_quote`: scope `prompt_system_output`, a non-empty
 *     version, `valid_until` still in the future, and not-to-exceed USD cents
 *     that bound the UTF-8 bytes of system+user plus the output max tokens.
 *     Quote expiry does not release a hold.
 * Missing ceiling → unavailable. A quote that is not reliable, not versioned,
 * expired, or short of that scope → no send. No price is invented here.
 *
 * Emit right: under the ceiling row lock, one caller id owns
 * `hq_call_emit_right` for (workspace, subject). The unique key is only a
 * backstop. Any other caller is `lost` and must not open a socket, including
 * on an already-authorized fallback provider. Only the winner may reserve
 * that fallback, and the fallback repeats this same quote and ceiling check.
 *
 * States: `held` may be released before the socket. `mark` before the socket
 * moves the row to `emitted_unknown` and requires reconciliation. That hold
 * has no TTL and release refuses it. Success consumes the row without setting
 * the cents to zero. This caps reserved quotes, not a provider invoice.
 *
 * A rejected registry call is unavailable, not an exception for the caller.
 * Before `mark`, that refuses the send and every fallback. After `mark`, the
 * cents confirmed by `reserve` stay even when `mark` and `release` are both
 * unavailable. Nothing here reports `released` unless `release` confirms it.
 *
 * `HQ_CALL_RESERVATION` must be exactly `1`. Any other value leaves the
 * control explicitly unavailable and does not change the send path.
 */

export type CallAccessClass = "subscription" | "api" | "local" | "unknown";

export type CallReservationStatus =
  | "held"
  | "released"
  | "emitted_unknown"
  | "consumed"
  | "duplicate"
  | "lost"
  | "refused"
  | "unavailable";

export type CallReservationSnapshot = {
  configured: boolean;
  status: CallReservationStatus;
  /** USD only when a server quote was reserved. Never a routing weight. */
  currency: "USD" | null;
  /** Integer cents from the server quote. Null when this attempt holds nothing. */
  reservedCents: number | null;
  accessClass?: CallAccessClass;
  networkEmitted: boolean;
  reconciliationRequired: boolean;
  reason?: string;
};

export type CallReservationIdentity = {
  workspaceId: string;
  subjectId: string;
  callerId: string;
  provider: "anthropic" | "openai";
};

export type CallReservationGate = {
  reserve(input: CallReservationIdentity & {
    accessClass: CallAccessClass;
    modelId: string;
    maxTokens: number;
    inputBytes: number;
  }): Promise<CallReservationSnapshot>;
  release(input: CallReservationIdentity): Promise<CallReservationSnapshot>;
  markEmitted(input: CallReservationIdentity): Promise<CallReservationSnapshot>;
  consume(input: CallReservationIdentity): Promise<CallReservationSnapshot>;
};

/** Server flag. Absent or any other value means the ledger is not in force. */
export function callReservationConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.HQ_CALL_RESERVATION === "1";
}

export function accessClassForModel(modelId: string): CallAccessClass {
  if (executionTargetForModel(modelId).callable) return "api";
  const id = modelId.toLowerCase();
  if (id.includes("subscription")) return "subscription";
  if (id.includes("local")) return "local";
  return "unknown";
}

/** UTF-8 size of the system and user text this process is about to send. */
export function requestInputBytes(systemPrompt: string, userPrompt: string): number {
  return new TextEncoder().encode(systemPrompt).length + new TextEncoder().encode(userPrompt).length;
}

export function unavailableReservation(reason?: string): CallReservationSnapshot {
  return {
    configured: false,
    status: "unavailable",
    currency: null,
    reservedCents: null,
    networkEmitted: false,
    reconciliationRequired: false,
    ...(reason ? { reason } : {}),
  };
}

function emptyHold(status: CallReservationStatus, configured: boolean, reason?: string): CallReservationSnapshot {
  return {
    configured,
    status,
    currency: null,
    reservedCents: null,
    networkEmitted: false,
    reconciliationRequired: false,
    ...(reason ? { reason } : {}),
  };
}

function readCents(value: Json | undefined): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function snapshotFromRpc(value: Json, configured: boolean): CallReservationSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyHold("unavailable", configured, "malformed");
  }
  const record = value as Record<string, Json | undefined>;
  const status = record.status;
  if (
    status !== "held" &&
    status !== "released" &&
    status !== "emitted_unknown" &&
    status !== "consumed" &&
    status !== "duplicate" &&
    status !== "lost" &&
    status !== "refused" &&
    status !== "unavailable"
  ) {
    return emptyHold("unavailable", configured, "malformed");
  }
  const reservedCents = readCents(record.reservedCents);
  const currency = record.currency === "USD" && reservedCents !== null ? "USD" : null;
  const holdsMoney = status === "held" || status === "emitted_unknown" || status === "consumed" || status === "duplicate";
  if (holdsMoney && (currency !== "USD" || reservedCents === null)) {
    return emptyHold("unavailable", configured, "malformed");
  }
  return {
    configured,
    status,
    currency: holdsMoney ? "USD" : null,
    reservedCents: holdsMoney ? reservedCents : null,
    networkEmitted: record.networkEmitted === true,
    reconciliationRequired: record.reconciliationRequired === true,
    ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    ...(typeof record.accessClass === "string" &&
    (record.accessClass === "subscription" ||
      record.accessClass === "api" ||
      record.accessClass === "local" ||
      record.accessClass === "unknown")
      ? { accessClass: record.accessClass }
      : {}),
  };
}

export function createDurableCallReservationGate(
  client = createOptionalSupabaseAdminClient(),
): CallReservationGate {
  const fail = async (reason: string): Promise<CallReservationSnapshot> => emptyHold("unavailable", true, reason);

  if (!client) {
    return {
      reserve: () => fail("store_unavailable"),
      release: () => fail("store_unavailable"),
      markEmitted: () => fail("store_unavailable"),
      consume: () => fail("store_unavailable"),
    };
  }

  async function asked(
    call: () => PromiseLike<{ data: Json | null; error: unknown }>,
  ): Promise<CallReservationSnapshot> {
    try {
      const { data, error } = await call();
      if (error) return emptyHold("unavailable", true, "store_unavailable");
      return snapshotFromRpc(data ?? null, true);
    } catch {
      return emptyHold("unavailable", true, "store_unavailable");
    }
  }

  return {
    reserve(input) {
      return asked(() => client.rpc("hq_reserve_call_attempt", {
        p_workspace_id: input.workspaceId,
        p_subject_id: input.subjectId,
        p_caller_id: input.callerId,
        p_provider: input.provider,
        p_model_id: input.modelId,
        p_access_class: input.accessClass,
        p_max_tokens: input.maxTokens,
        p_input_bytes: input.inputBytes,
      }));
    },
    release(input) {
      return asked(() => client.rpc("hq_release_call_attempt", {
        p_workspace_id: input.workspaceId,
        p_subject_id: input.subjectId,
        p_caller_id: input.callerId,
        p_provider: input.provider,
      }));
    },
    markEmitted(input) {
      return asked(() => client.rpc("hq_mark_call_emitted", {
        p_workspace_id: input.workspaceId,
        p_subject_id: input.subjectId,
        p_caller_id: input.callerId,
        p_provider: input.provider,
      }));
    },
    consume(input) {
      return asked(() => client.rpc("hq_consume_call_attempt", {
        p_workspace_id: input.workspaceId,
        p_subject_id: input.subjectId,
        p_caller_id: input.callerId,
        p_provider: input.provider,
      }));
    },
  };
}

export type AttemptAuthorization =
  | { emit: true; reservation: CallReservationSnapshot; identity: CallReservationIdentity }
  | { emit: false; reservation: CallReservationSnapshot };

/**
 * Decides whether this caller may open one provider socket.
 * The cents and the currency come from the server quote row inside the gate.
 * The caller cannot pass a ceiling, a price, or a routing weight.
 */
export async function authorizeCallAttempt(input: {
  configured: boolean;
  gate: CallReservationGate | null;
  workspaceId?: string;
  callSubjectId?: string;
  callerId?: string;
  provider: "anthropic" | "openai";
  modelId: string;
  maxTokens: number;
  inputBytes: number;
  hasApiKey: boolean;
}): Promise<AttemptAuthorization> {
  if (!input.configured) {
    return {
      emit: true,
      reservation: unavailableReservation(),
      identity: {
        workspaceId: input.workspaceId ?? "",
        subjectId: input.callSubjectId ?? "",
        callerId: input.callerId ?? "",
        provider: input.provider,
      },
    };
  }

  const accessClass = accessClassForModel(input.modelId);
  if (!input.workspaceId || !input.callSubjectId || !input.callerId) {
    return {
      emit: false,
      reservation: {
        ...emptyHold("unavailable", true, "identity"),
        accessClass,
      },
    };
  }

  const identity: CallReservationIdentity = {
    workspaceId: input.workspaceId,
    subjectId: input.callSubjectId,
    callerId: input.callerId,
    provider: input.provider,
  };

  if (accessClass !== "api") {
    return {
      emit: false,
      reservation: {
        ...emptyHold("refused", true, "access_class"),
        accessClass,
      },
    };
  }

  if (
    !Number.isSafeInteger(input.maxTokens) || input.maxTokens < 1 || input.maxTokens > 200_000
    || !Number.isSafeInteger(input.inputBytes) || input.inputBytes < 0 || input.inputBytes > 2_000_000
  ) {
    return {
      emit: false,
      reservation: {
        ...emptyHold("refused", true, "estimate_insufficient"),
        accessClass,
      },
    };
  }

  const gate = input.gate;
  if (!input.hasApiKey || !gate) {
    return {
      emit: false,
      reservation: {
        ...emptyHold(gate ? "refused" : "unavailable", true, gate ? "no_api_key" : "store_unavailable"),
        accessClass,
      },
    };
  }

  const reserved = await readGate(() => gate.reserve({
    ...identity,
    accessClass,
    modelId: input.modelId,
    maxTokens: input.maxTokens,
    inputBytes: input.inputBytes,
  }));
  if (reserved.status !== "held" || reserved.currency !== "USD" || reserved.reservedCents === null) {
    return { emit: false, reservation: { ...reserved, configured: true, accessClass } };
  }

  const emitted = await readGate(() => gate.markEmitted(identity));
  if (markConfirmed(emitted, reserved.reservedCents)) {
    return {
      emit: true,
      reservation: { ...emitted, configured: true, accessClass },
      identity,
    };
  }

  const released = await readGate(() => gate.release(identity));
  if (
    released.status === "released" &&
    released.networkEmitted === false &&
    released.reconciliationRequired === false
  ) {
    return {
      emit: false,
      reservation: { ...released, configured: true, accessClass, reason: released.reason ?? "mark_failed" },
    };
  }

  const ledger = released.status === "emitted_unknown" || released.status === "consumed"
    ? released
    : emitted.status === "emitted_unknown" || emitted.status === "consumed"
      ? emitted
      : null;
  const ledgerAgrees = ledger !== null
    && ledger.currency === "USD"
    && ledger.reservedCents === reserved.reservedCents;
  return {
    emit: false,
    reservation: {
      configured: true,
      accessClass,
      status: ledger?.status === "consumed" ? "consumed" : "emitted_unknown",
      currency: "USD",
      reservedCents: reserved.reservedCents,
      networkEmitted: ledgerAgrees ? ledger.networkEmitted : true,
      reconciliationRequired: true,
      reason: "mark_unconfirmed",
    },
  };
}

async function readGate(
  call: () => Promise<CallReservationSnapshot>,
): Promise<CallReservationSnapshot> {
  try {
    return await call();
  } catch {
    return emptyHold("unavailable", true, "store_unavailable");
  }
}

function markConfirmed(emitted: CallReservationSnapshot, reservedCents: number): boolean {
  return emitted.status === "emitted_unknown"
    && emitted.currency === "USD"
    && emitted.reservedCents === reservedCents
    && emitted.networkEmitted === true
    && emitted.reconciliationRequired === true;
}
