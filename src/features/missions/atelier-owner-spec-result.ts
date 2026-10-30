/** Browser-safe, minimal projection of historical evidence. Never an execution grant. */
type ReadOnlyEvidence = { executionAvailable: false; independentlyValidated: false };
export type AtelierOwnerSpecEvidence = ReadOnlyEvidence & (
  | { state: "absent" }
  | { state: "unverified" }
  | { state: "reserved" | "awaiting_result"; runId: string }
  | { state: "recorded"; runId: string; attemptId: string;
      status: "succeeded" | "failed" | "blocked" | "interrupted" | "reconciliation_required";
      artifact: { text: string; sha256: string; bytes: number; baseSha: string } | null }
);
