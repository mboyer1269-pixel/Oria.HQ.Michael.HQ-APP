import "server-only";
import { z } from "zod";
import type { OwnerAccess } from "@/server/auth/owner";
import type { PersonalConnectionEvidenceStatus, PersonalConnectionStatus } from "@/core/personal-connection-status";
import { launchConfigSchema, type LaunchConfig } from "@/core/openhands-launch-contract";
import {
  defaultLoadLaunchConfig, resolveRunnerAdapterAvailability,
  CONNECTION_EVIDENCE_TRANSPORT_ENV_VAR, type RunnerAdapterAvailability,
} from "@/server/missions/model-emission-launch-gate";
import {
  connectionEvidenceBindingSchema, loadConnectionEvidenceBinding, readRunnerConnectionEvidence,
  type ConnectionEvidenceBinding, type ConnectionEvidenceReadResult,
} from "./runner-connection-evidence";
import { isEvidenceSource } from "./provider-connection-discovery";

export type PersonalConnectionStatusContext = { workspaceId: string; access: OwnerAccess };
export type PersonalConnectionStatusDeps = {
  loadLaunchConfig: () => LaunchConfig | null;
  resolveAdapter: (providerId: string) => RunnerAdapterAvailability;
  loadEvidenceBinding: () => ConnectionEvidenceBinding | null;
  readEvidence: (binding: ConnectionEvidenceBinding) => Promise<ConnectionEvidenceReadResult>;
  confirmationTransport: () => "persisted" | "operator_probe";
};

const defaults: PersonalConnectionStatusDeps = {
  loadLaunchConfig: defaultLoadLaunchConfig,
  resolveAdapter: resolveRunnerAdapterAvailability,
  loadEvidenceBinding: loadConnectionEvidenceBinding,
  readEvidence: readRunnerConnectionEvidence,
  confirmationTransport: () => process.env[CONNECTION_EVIDENCE_TRANSPORT_ENV_VAR] === "persisted" ? "persisted" : "operator_probe",
};
const reference = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const uuid = z.uuid();
const evidenceStatuses: Record<Exclude<ConnectionEvidenceReadResult["status"], "ok">, PersonalConnectionEvidenceStatus> = {
  policy_unavailable: "policy_mismatch", unavailable: "unavailable", no_row: "missing",
  malformed_row: "invalid", binding_mismatch: "scope_mismatch", policy_mismatch: "policy_mismatch",
  stale: "stale", not_connected: "not_connected",
};

/** Read-only metadata. Never invokes an active probe, SSH, login or model.
 * The caller must pass requireOwnerAccess's actual result and the active workspace.
 * The authorized reader is not inferred from recordedBy or configured identities.
 * The persisted reader owns freshness, policy and account validation. Even its
 * positive result does not verify the selected confirmation transport or a mission.
 */
export async function getPersonalConnectionStatus(
  context: PersonalConnectionStatusContext,
  dependencies: Partial<PersonalConnectionStatusDeps> = {},
): Promise<PersonalConnectionStatus> {
  if (context?.access?.status !== "authorized") {
    return { status: "access_denied", scope: null, connection: null };
  }
  if (!reference.safeParse(context.workspaceId).success || !uuid.safeParse(context.access.user?.id).success) {
    return { status: "invalid_context", scope: null, connection: null };
  }
  const scope = { workspaceRef: context.workspaceId, ownerActorRef: context.access.user.id };
  const deps = { ...defaults, ...dependencies };
  try {
    const raw = deps.loadLaunchConfig();
    if (raw === null) return { status: "not_configured", scope, connection: null };
    const parsed = launchConfigSchema.safeParse(raw);
    if (!parsed.success || !reference.safeParse(parsed.data.runnerId).success) {
      return { status: "unavailable", scope, connection: null };
    }
    const config = parsed.data;
    const profile = config.providerProfile;
    if (!profile) return { status: "not_configured", scope, connection: null };
    const availability = deps.resolveAdapter(profile.provider === "claude" ? "claude-code-cli" : "codex-acp-cli");
    const transport = deps.confirmationTransport();
    if (transport !== "persisted" && transport !== "operator_probe") {
      return { status: "unavailable", scope, connection: null };
    }
    const connection: NonNullable<PersonalConnectionStatus["connection"]> = {
      provider: profile.provider, runnerRef: config.runnerId,
      adapterStatus: availability.status === "implemented" ? "implemented" : "unavailable",
      accountRef: null, evidenceStatus: "not_checked", confirmationTransport: transport,
      confirmationReadiness: "not_verified", chatStatus: "unavailable", missionStatus: "not_verified",
    };
    if (connection.adapterStatus === "unavailable") return { status: "configured", scope, connection };
    const rawBinding = deps.loadEvidenceBinding();
    if (rawBinding === null) {
      connection.evidenceStatus = "not_configured";
      return { status: "configured", scope, connection };
    }
    const binding = connectionEvidenceBindingSchema.safeParse(rawBinding);
    if (!binding.success) connection.evidenceStatus = "invalid";
    else if (binding.data.workspaceId !== context.workspaceId) connection.evidenceStatus = "scope_mismatch";
    else if (binding.data.runnerId !== config.runnerId || binding.data.provider !== "claude-code-cli") connection.evidenceStatus = "policy_mismatch";
    else {
      const evidence = await deps.readEvidence(binding.data);
      if (evidence.status === "ok") {
        const outcome = evidence.outcome;
        if (outcome.connectionState === "connected" && isEvidenceSource(outcome.source)
          && outcome.source !== "declared-capability" && uuid.safeParse(outcome.accountId).success) {
          connection.accountRef = outcome.accountId!;
          connection.evidenceStatus = "observed";
        } else connection.evidenceStatus = "invalid";
      } else connection.evidenceStatus = evidenceStatuses[evidence.status] ?? "unavailable";
    }
    return { status: "configured", scope, connection };
  } catch {
    // Exceptions, private binding values and provider diagnostic text never cross this boundary.
    return { status: "unavailable", scope, connection: null };
  }
}
