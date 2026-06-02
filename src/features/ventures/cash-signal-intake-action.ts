"use server";

// src/features/ventures/cash-signal-intake-action.ts
//
// Owner-gated server action that persists a captured cash signal through the
// append-only repository. This is NOT a public endpoint — it is a Next.js
// server action, reachable only from the owner-gated /hq/ventures/cash-actions
// surface and guarded again here with requireOwnerAccess (defense in depth).
//
// It NEVER executes, sends, charges, contacts, or dispatches anything. It only
// records proof. The server rebuilds and re-validates the intake from raw
// fields — it never trusts a client-built object — and re-checks the strict
// accounting rule before persisting.

import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { CASH_SIGNAL_TYPES } from "@/features/ventures/cash-action-packet";
import type { CashSignalType } from "@/features/ventures/cash-action-packet";
import { buildCashSignalIntake, validateCashSignalIntake } from "@/features/ventures/cash-signal-intake";
import type {
  CashSignalIntakeRawInput,
  SaveCashSignalIntakeResult,
} from "@/features/ventures/cash-signal-intake-persistence-types";
import { requireOwnerAccess } from "@/server/auth/owner";
import {
  createCashSignalIntake,
  getCashSignalIntakePersistenceMode,
} from "@/server/ventures/cash-signal-intake-repository";

const SIGNAL_TYPE_SET: ReadonlySet<string> = new Set(CASH_SIGNAL_TYPES);

export async function saveCashSignalIntakeAction(
  input: CashSignalIntakeRawInput,
): Promise<SaveCashSignalIntakeResult> {
  const access = await requireOwnerAccess("/hq/ventures/cash-actions");
  if (access.status === "forbidden") {
    return { status: "forbidden" };
  }

  // Never trust the client's signal type — validate against the whitelist.
  if (!SIGNAL_TYPE_SET.has(input.signalType)) {
    return { status: "error", errors: [`unknown signalType "${input.signalType}"`] };
  }

  // Rebuild the intake server-side from raw fields (normalizes the EvidenceRef).
  const intake = buildCashSignalIntake({
    signalId: input.signalId,
    packetId: input.packetId,
    ventureId: input.ventureId,
    sourceAgentId: input.sourceAgentId,
    signalType: input.signalType as CashSignalType,
    referenceId: input.referenceId,
    isVerified: input.isVerified,
    summary: input.summary,
    capturedAt: input.capturedAt,
    ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
  });

  // Re-validate (this enforces the strict accounting rule: positive amount
  // requires a verified financial signal).
  const validation = validateCashSignalIntake(intake);
  if (!validation.valid) {
    return { status: "error", errors: validation.errors };
  }

  const workspaceId = getDefaultWorkspace({ ownerUserId: access.user.id }).id;

  try {
    const saved = await createCashSignalIntake(workspaceId, access.user.id, intake);
    return { status: "saved", intake: saved, storageMode: getCashSignalIntakePersistenceMode() };
  } catch {
    return { status: "error", errors: ["Persistence failed. The signal was not saved."] };
  }
}
