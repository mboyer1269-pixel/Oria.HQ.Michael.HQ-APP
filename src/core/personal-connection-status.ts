/** Public read model only. References identify existing records, never credentials.
 * ownerActorRef identifies the authorized reader, not ownership of a provider account.
 */
export type PersonalConnectionEvidenceStatus =
  | "not_checked" | "not_configured" | "scope_mismatch" | "policy_mismatch"
  | "unavailable" | "missing" | "invalid" | "stale" | "not_connected" | "observed";

export type PersonalConnectionStatus = {
  status: "access_denied" | "invalid_context" | "not_configured" | "unavailable" | "configured";
  scope: { workspaceRef: string; ownerActorRef: string } | null;
  connection: {
    provider: "claude" | "codex";
    runnerRef: string;
    adapterStatus: "implemented" | "unavailable";
    accountRef: string | null;
    /** observed means evidence validated on this read, not permission to launch. */
    evidenceStatus: PersonalConnectionEvidenceStatus;
    confirmationTransport: "persisted" | "operator_probe";
    confirmationReadiness: "not_verified";
    chatStatus: "unavailable";
    missionStatus: "not_verified";
  } | null;
};
