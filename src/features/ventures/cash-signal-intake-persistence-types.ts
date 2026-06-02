// src/features/ventures/cash-signal-intake-persistence-types.ts
//
// Shared, dependency-free types for the cash-signal-intake persistence flow.
// Imported by both the server action and the client screen, so this module has
// NO "use server"/"use client" directive and no server-only imports.

import type { CashSignalIntake } from "./cash-signal-intake";
import type { VenturePersistenceMode } from "./venture-save-types";

/**
 * Result of attempting to persist one captured cash signal.
 *   - saved: the validated intake was appended; storageMode tells the UI which
 *     backend handled it (supabase / local / unavailable) so it never lies.
 *   - error: validation or persistence failed; the messages explain why and the
 *     signal is NOT treated as persisted.
 *   - forbidden: the owner gate refused the caller.
 */
export type SaveCashSignalIntakeResult =
  | { status: "saved"; intake: CashSignalIntake; storageMode: VenturePersistenceMode }
  | { status: "error"; errors: string[] }
  | { status: "forbidden" };

/** The server action signature, as seen by the client screen. */
export type SaveCashSignalIntakeAction = (
  input: CashSignalIntakeRawInput,
) => Promise<SaveCashSignalIntakeResult>;

/**
 * The serializable raw fields the client sends to the action. The server
 * rebuilds and re-validates the intake from these — it never trusts a
 * client-built object. Mirrors CashSignalIntakeInput without importing it, to
 * keep this module free of any build-time coupling.
 */
export type CashSignalIntakeRawInput = {
  signalId: string;
  packetId: string;
  ventureId: string;
  sourceAgentId: string;
  signalType: string;
  referenceId: string;
  isVerified: boolean;
  amountCents?: number;
  summary: string;
  capturedAt: string;
};
