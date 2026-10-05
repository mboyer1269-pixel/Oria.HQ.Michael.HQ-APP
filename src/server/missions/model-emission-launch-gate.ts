/** Gates confirm_launch using the confirmed plan's provider, account and policy.
 * Reuses the launch schema, approval repository and provider discovery. Preview
 * does not launch. Both approval and connection are rechecked before dispatch.
 * Subscription capabilities use the non-API path; they never imply zero cost.
 * The default probe requires an approved, workspace-bound operator configuration.
 * Mission CAS protects the mission snapshot, not an atomic transaction across
 * the approval/account stores; the final recheck-to-CAS window still exists.
 */
import type { Mission } from "@/core/types";
import { launchConfigSchema, type LaunchConfig } from "@/core/openhands-launch-contract";
import { deriveMissionApprovalConfirmation } from "./approval-derivation";
import type { MissionApprovalRecord } from "./approval-record";
import { isDeepStrictEqual } from "node:util";
import { missionApprovalBindingMatches } from "./mission-approval-binding";
import {
  evaluateModelEmissionGate,
  type ModelEmissionAuthorizationDecision,
  type ModelEmissionGateResult,
} from "./model-emission-gate";
import { createStaticProviderRegistry } from "../agents/models/provider-registry-contract";
import {
  resolveProviderConnectionDiscovery,
  isExecutionReady,
  type ProviderConnectionEntry,
  type ProviderConnectionProbe,
} from "../agents/models/provider-connection-discovery";
import { createConfiguredRunnerConnectionProbe } from "../agents/models/runner-executor-connection-probe";
import { createPersistedRunnerConnectionProbe } from "../agents/models/runner-connection-evidence";
import type { ProviderRegistry } from "../agents/models/provider-registry-contract";

// ---------------------------------------------------------------------------
// The executor providers a real LaunchConfig can name today
// ---------------------------------------------------------------------------
//
// providerProfileSchema.provider is a discriminated union of explicit
// literals ("claude" | "codex" — see core/openhands-launch-contract.ts),
// never an open enum. This map and the registry below carry one explicit,
// fully-spelled entry per literal, mirroring
// integrations/openhands-runner/provider_policy.py's PROVIDER_POLICIES dict
// on the Orchestrator side. Adding a third literal to that schema is the
// only reason to add a third entry here too; nothing here invents a
// provider the schema does not already allow, and nothing here collapses
// the two into a shared/generic entry — each is independently real-plan-
// aligned, same as the schema itself.

const PROVIDER_PROFILE_TO_REGISTRY_PROVIDER_ID: Readonly<Record<string, string>> = {
  claude: "claude-code-cli",
  codex: "codex-acp-cli",
};

const EXECUTOR_PROVIDER_REGISTRY_RESULT = createStaticProviderRegistry({
  providers: [
    {
      id: "claude-code-cli",
      label: "Claude Code CLI subscription (OpenHands executor)",
      kind: "api",
      trustLevel: "reviewed",
      supportsMcp: false,
      supportsToolUse: true,
    },
    {
      id: "codex-acp-cli",
      label: "Codex ACP subscription (OpenHands executor candidate, unqualified)",
      kind: "api",
      trustLevel: "reviewed",
      supportsMcp: false,
      supportsToolUse: true,
    },
  ],
  models: [
    {
      id: "openhands-executor/claude-code-cli",
      providerId: "claude-code-cli",
      label: "Claude Code CLI subscription executor (OpenHands runner)",
      pricing: { promptUsdPerMTok: null, completionUsdPerMTok: null, perRequestUsd: null },
      costTier: "economy",
      supportsToolUse: true,
      supportsStructuredJson: true,
      supportsMcp: false,
      provenance: { source: "manual" },
    },
    {
      id: "openhands-executor/codex-acp-cli",
      providerId: "codex-acp-cli",
      label: "Codex ACP subscription executor (OpenHands runner candidate, unqualified)",
      pricing: { promptUsdPerMTok: null, completionUsdPerMTok: null, perRequestUsd: null },
      costTier: "economy",
      supportsToolUse: true,
      supportsStructuredJson: true,
      supportsMcp: false,
      provenance: { source: "manual" },
    },
  ],
  adapters: [
    {
      id: "claude-code-cli-subscription",
      label: "Claude Code CLI subscription",
      kind: "cli-subscription",
      providerId: "claude-code-cli",
      sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true },
      ledgerRequired: true,
    },
    {
      id: "codex-acp-cli-subscription",
      label: "Codex ACP subscription",
      kind: "cli-subscription",
      providerId: "codex-acp-cli",
      sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true },
      ledgerRequired: true,
    },
  ],
});

if (!EXECUTOR_PROVIDER_REGISTRY_RESULT.ok) {
  throw new Error(
    `executor provider registry is invalid: ${EXECUTOR_PROVIDER_REGISTRY_RESULT.errors.join("; ")}`,
  );
}

/** The known-verifiable executor providers today: "claude-code-cli" and
 * "codex-acp-cli". Not a general catalog — every entry here corresponds to a
 * literal providerProfileSchema already allows and nothing else. */
export const DEFAULT_EXECUTOR_PROVIDER_REGISTRY: ProviderRegistry = EXECUTOR_PROVIDER_REGISTRY_RESULT.registry;

/** Which connection-evidence transport this server process uses for
 * confirm_launch's account/capability check. Explicit and closed by
 * default: unset (or any value other than exactly "persisted") keeps
 * today's SSH-only behavior byte-for-byte unchanged, including its refusal
 * under a cloud marker. This is never inferred from a probe's own refusal
 * — see createDefaultConnectionProbe's comment for why a prior draft that
 * tried that was wrong. */
export const CONNECTION_EVIDENCE_TRANSPORT_ENV_VAR = "ORIA_OPENHANDS_CONNECTION_EVIDENCE_TRANSPORT";

/**
 * Re-read the operator's workspace-bound SSH/container approval on every
 * probe. No configured approval means no subprocess. Account identity still
 * comes only from the executor CLI's actual response and the server
 * identity repository.
 *
 * Transport selection is explicit, not a fallback chain: this does NOT try
 * the SSH probe and fall through to persisted evidence on failure. Doing so
 * was tried and rejected in review — the SSH probe's one generic refusal
 * message ("operator binding absent, unapproved, invalid, forbidden or
 * workspace-mismatched") is produced both by a genuinely revoked operator
 * approval and by simply running under a cloud marker, so matching on it
 * would let a revoked approval silently fall through to a stale persisted
 * "connected" claim instead of staying refused. Instead the server names
 * its transport once, via CONNECTION_EVIDENCE_TRANSPORT_ENV_VAR: SSH unless
 * that variable is exactly "persisted". The persisted transport has its own
 * independent, explicitly approved consumption binding
 * (runner-connection-evidence.ts's loadConnectionEvidenceBinding) and never
 * accepts evidence for a workspace/provider/runner/container it was not
 * configured to trust.
 */
export function createDefaultConnectionProbe(workspaceId: string): ProviderConnectionProbe {
  if (process.env[CONNECTION_EVIDENCE_TRANSPORT_ENV_VAR] === "persisted") {
    return createPersistedRunnerConnectionProbe(workspaceId);
  }
  return createConfiguredRunnerConnectionProbe(workspaceId);
}

export type ProviderBindingResolution =
  | { status: "bound"; providerId: string; registryProviderId: string }
  | { status: "no_provider_binding" }
  | { status: "plan_executor_mismatch"; registryProviderId: string };

/**
 * Pure: resolves which registry provider id a confirmed LaunchConfig
 * actually requires, and whether the given registry even knows about it.
 * Exported so the mismatch case is independently testable without needing
 * a full gate run.
 */
export function resolveExecutorProviderBinding(
  config: LaunchConfig | null,
  registry: ProviderRegistry,
): ProviderBindingResolution {
  const providerProfile = config?.providerProfile;
  if (!providerProfile) {
    return { status: "no_provider_binding" };
  }
  const registryProviderId = PROVIDER_PROFILE_TO_REGISTRY_PROVIDER_ID[providerProfile.provider];
  if (!registryProviderId) {
    return { status: "no_provider_binding" };
  }
  if (!registry.getProvider(registryProviderId)) {
    return { status: "plan_executor_mismatch", registryProviderId };
  }
  return { status: "bound", providerId: providerProfile.provider, registryProviderId };
}

/**
 * Pure: does a freshly re-read approval record still authorize the EXACT
 * same decision `authorizedRecord` was? Checked by identity (id, approver,
 * approval timestamp) via deriveMissionApprovalConfirmation, never by status
 * alone — a DIFFERENT record that also happens to say "approved" (a
 * revocation immediately followed by someone else's unrelated approval, a
 * wrong-account substitution, or any other replacement) must never be
 * accepted as "the same one this decision was made against". Exported so
 * the revocation/substitution/stability cases are independently testable
 * without needing the rest of the gate (in particular Cursor's
 * assessServerEmission/ApprovedServerBinding contract, which this function
 * never touches) to resolve first.
 */
export function approvalStillAuthorizes(
  mission: Mission,
  authorizedRecord: MissionApprovalRecord,
  recheckRecord: MissionApprovalRecord | null,
): boolean {
  const recheck = deriveMissionApprovalConfirmation(mission, recheckRecord);
  return (
    recheck.approvalConfirmed &&
    recheck.record.id === authorizedRecord.id &&
    recheck.record.approvedBy === authorizedRecord.approvedBy &&
    recheck.record.approvedAt === authorizedRecord.approvedAt
    && isDeepStrictEqual(recheck.record.binding, authorizedRecord.binding)
  );
}

/**
 * Pure: does a freshly re-probed connection entry still attest to the EXACT
 * same account identity `authorizedAccountId` was, and is it still
 * execution-ready? A profile/config identity is never an acceptable
 * stand-in here — only a probe's own accountId counts. Three distinct ways
 * this refuses, all by design, none folded into the others:
 *   - the recheck has NO attested accountId at all (the probe lost the
 *     ability to prove who is connected, or was never able to)
 *   - the recheck attests to a DIFFERENT accountId (the connected account
 *     changed under the same provider/profile — never read as "same as
 *     before" just because the profile/workspace/model did not change)
 *   - the recheck is no longer execution-ready (isExecutionReady — a
 *     declared-only or lost connection is never "still fine")
 * Exported so each case is independently testable, same doctrine as
 * approvalStillAuthorizes.
 */
export function attestedAccountStillMatches(
  authorizedAccountId: string,
  recheckEntry: Pick<ProviderConnectionEntry, "accountId" | "connectionState" | "source"> | null,
): boolean {
  return (
    recheckEntry !== null &&
    recheckEntry.accountId === authorizedAccountId &&
    isExecutionReady(recheckEntry)
  );
}

// ---------------------------------------------------------------------------
// The gate wrapper
// ---------------------------------------------------------------------------

export type OpenHandsLaunchFn = (
  context: { workspaceId: string; actorId: string },
  missionId: string,
  confirmation?: { expectedLaunchHash: string; confirm: true; approvalRecordId?: string },
) => Promise<{ status: string; [key: string]: unknown }>;

export type GatedOpenHandsLaunchDeps = {
  /** The real launch caller this wraps — e.g. createConfiguredOpenHandsLaunch(). Never reimplemented. */
  launch: OpenHandsLaunchFn;
  /** Loads the real persisted mission. Read-only; the real launch call loads it again on its own. */
  loadMission: (workspaceId: string, missionId: string) => Promise<Mission | null>;
  /** The real persisted approval-record lookup — approval-record-repository.ts's getMissionApprovalRecord. */
  loadApprovalRecord: (missionId: string) => Promise<MissionApprovalRecord | null>;
  /**
   * Reads and parses the SAME launch configuration source
   * createConfiguredOpenHandsLaunch() reads (ORIA_OPENHANDS_LAUNCH_CONFIG by
   * default) — never a second, independently-chosen config.
   */
  loadLaunchConfig?: () => LaunchConfig | null;
  /** Registry of executor providers this gate can actually verify. Defaults to the one real binding today. */
  registry?: ProviderRegistry;
  /** Probe for whichever provider resolveExecutorProviderBinding() resolves to. Defaults to an honest "unverifiable" stub. */
  connectionProbe?: ProviderConnectionProbe;
  now?: () => number;
};

export type GatedOpenHandsLaunchBlockedResult =
  | { status: "no_provider_binding"; externalEffectAllowed: false }
  | { status: "plan_executor_mismatch"; externalEffectAllowed: false; registryProviderId: string }
  | {
      status: "account_identity_unverifiable";
      externalEffectAllowed: false;
      providerId: string;
      configFileEnvVar: "ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE";
      requiredAction: string;
    }
  | { status: "model_emission_blocked"; externalEffectAllowed: false; gate: ModelEmissionGateResult }
  | { status: "approval_changed_before_commit"; externalEffectAllowed: false }
  | { status: "account_identity_changed_before_commit"; externalEffectAllowed: false };

export function defaultLoadLaunchConfig(): LaunchConfig | null {
  const raw = process.env.ORIA_OPENHANDS_LAUNCH_CONFIG;
  if (!raw || Buffer.byteLength(raw, "utf8") > 4096) return null;
  try {
    const parsed = launchConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function accountIdentityUnverifiableResult(
  providerId: string,
  entry: ProviderConnectionEntry | null,
): Extract<GatedOpenHandsLaunchBlockedResult, { status: "account_identity_unverifiable" }> {
  const base = {
    status: "account_identity_unverifiable" as const,
    externalEffectAllowed: false as const,
    providerId,
    configFileEnvVar: "ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE" as const,
  };
  if (!entry) {
    return {
      ...base,
      requiredAction:
        `No runner connection entry was observed for ${providerId}. Check ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE points to the approved workspace binding and that the configured runner/container is reachable.`,
    };
  }
  if (!isExecutionReady(entry)) {
    return {
      ...base,
      requiredAction:
        entry.requiredAction ??
        `Runner connection for ${providerId} is not execution-ready. Check ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE and the configured /usr/local/bin/claude-agent-acp status command.`,
    };
  }
  return {
    ...base,
    requiredAction:
      `Runner connection for ${providerId} is ready but did not expose an attestable Claude account email/subscription shape. Check ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE targets the qualified container and that /usr/local/bin/claude-agent-acp --cli auth status --json returns a claude.ai login with email and subscriptionType or apiProvider:firstParty.`,
  };
}

/**
 * Wraps `deps.launch` so the actual commit to launch (confirm_launch) is
 * refused BEFORE it runs unless: (1) the confirmed plan names a provider
 * this gate's registry actually knows, (2) that provider is observed
 * connected and execution-ready, and (3) a real persisted approval record
 * verifies.
 *
 * A mission this gate cannot see is refused, NEVER passed through to the
 * real launch on a confirm — a prior version did pass it through here,
 * reasoning "the real service will answer not_found anyway". That is a real
 * TOCTOU bypass: deps.launch() performs its OWN fresh load internally, so a
 * mission that is created (or becomes visible) in the gap between THIS
 * load and that one would reach the real launch service having NEVER been
 * evaluated by this gate at all — zero gate checks, for a mission that
 * exists. So on confirm_launch, a null load is a hard stop: deps.launch is
 * called zero times, same as every other refusal path below.
 */
export function createGatedOpenHandsLaunch(deps: GatedOpenHandsLaunchDeps): OpenHandsLaunchFn {
  const registry = deps.registry ?? DEFAULT_EXECUTOR_PROVIDER_REGISTRY;
  const loadLaunchConfig = deps.loadLaunchConfig ?? defaultLoadLaunchConfig;
  const now = deps.now ?? Date.now;

  return async (context, missionId, confirmation) => {
    if (!confirmation) {
      return deps.launch(context, missionId, confirmation);
    }

    // Built per call, scoped to THIS confirmation's own workspace — never a
    // single shared instance, so one workspace's probe can never resolve an
    // account attestation bound to another workspace's auth evidence. See
    // createDefaultConnectionProbe's own comment above.
    const connectionProbe = deps.connectionProbe ?? createDefaultConnectionProbe(context.workspaceId);

    const mission = await deps.loadMission(context.workspaceId, missionId);
    if (!mission) {
      // Refuse, do not delegate: see the TOCTOU note above this function.
      return { status: "mission_unavailable_for_gate", externalEffectAllowed: false };
    }

    const config = loadLaunchConfig();
    if (config?.providerProfile && !config.foundationModelId)
      return { status: "model_selection_required", externalEffectAllowed: false };
    const binding = resolveExecutorProviderBinding(config, registry);
    if (binding.status === "no_provider_binding") {
      return { status: "no_provider_binding", externalEffectAllowed: false };
    }
    if (binding.status === "plan_executor_mismatch") {
      return {
        status: "plan_executor_mismatch",
        externalEffectAllowed: false,
        registryProviderId: binding.registryProviderId,
      };
    }

    // The model id is derived from the registry's own binding, never
    // hardcoded twice: exactly one model for the resolved provider is
    // required, or this is itself an unresolved binding.
    const candidateModels = registry.listModels().filter((model) => model.providerId === binding.registryProviderId);
    if (candidateModels.length !== 1) {
      return {
        status: "plan_executor_mismatch",
        externalEffectAllowed: false,
        registryProviderId: binding.registryProviderId,
      };
    }
    const modelId = candidateModels[0].id;

    const record = await deps.loadApprovalRecord(missionId);
    const derivation = deriveMissionApprovalConfirmation(mission, record);
    // No record at all is genuinely "nothing to decide from yet" — distinct
    // from a record that exists but failed verification (rejected, expired,
    // wrong scope), which IS a real decision: authorized: false.
    const authorization: ModelEmissionAuthorizationDecision | null =
      derivation.record === null
        ? null
        : {
            authorized: derivation.approvalConfirmed,
            authorizedBy: derivation.record.approvedBy ?? "unknown",
            authorizedAtIso: derivation.record.approvedAt ?? new Date(0).toISOString(),
          };

    // catalogRevision (ApprovedServerBinding axis): a real, already-qualified
    // identity for "which policy revision this was qualified against" —
    // providerProfile.policySha256, guaranteed present because
    // binding.status === "bound" already required a providerProfile. This
    // axis is unaffected by the accountId correction below: a policy
    // revision IS a config-time fact, unlike an account identity.
    const providerProfile = config?.providerProfile;
    if (!providerProfile) {
      return { status: "no_provider_binding", externalEffectAllowed: false };
    }
    const catalogRevision = providerProfile.policySha256;

    const nowMs = now();
    const discovery = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: context.workspaceId,
      requestingWorkspaceId: context.workspaceId,
      probe: connectionProbe,
      nowIso: new Date(nowMs).toISOString(),
    });
    const connectionSnapshot = discovery.status === "ok" ? discovery.snapshot : null;
    const connectionEntry = connectionSnapshot?.entries.find(
      (entry) => entry.providerId === binding.registryProviderId,
    ) ?? null;

    // accountId (ApprovedServerBinding axis): the server's own ATTESTATION
    // of which account the connection probe actually observed — NEVER
    // providerProfile.id. A profile identifies a POLICY (e.g.
    // "claude-default"); it does not identify, and was never meant to
    // identify, the specific account currently connected behind it. Two
    // different accounts can share a profile; the same profile's underlying
    // credentials can change without its id ever changing. Using the
    // profile id as a stand-in silently defeats the whole purpose of this
    // axis — caught in independent review, corrected here.
    //
    // Without a genuinely attested identity, this gate refuses explicitly
    // ("account_identity_unverifiable") rather than inventing one or
    // quietly falling back to the profile. Today's real probe
    // (runner-executor-connection-probe.ts) never populates accountId at
    // all — its underlying classifier's evidence whitelist deliberately
    // carries no safe per-account distinguishing field — so in THIS
    // environment every confirm_launch refuses here, honestly, in addition
    // to (and ahead of) the "no runner host" refusal it would otherwise hit
    // deeper in the chain.
    const accountId = connectionEntry?.accountId;
    if (!accountId) {
      return accountIdentityUnverifiableResult(binding.registryProviderId, connectionEntry);
    }

    const gate = evaluateModelEmissionGate({
      workspaceId: context.workspaceId,
      requestingWorkspaceId: context.workspaceId,
      modelId,
      requiresTools: true,
      registry,
      connectionSnapshot,
      authorization,
      // "subscription" billing (derived inside the gate from the connection
      // evidence) carries no tariff by contract — never asked for here.
      tariff: null,
      invokedProviderId: binding.registryProviderId,
      accountId,
      catalogRevision,
      nowMs,
    });

    // Cursor's assessServerEmission refuses to EMIT (metered-call) a
    // subscription-billed capability — disposition:"non_api" — because its
    // own JSON-generation call path cannot meter a subscription per token.
    // That refusal is correct for THAT path and is NOT the same thing as
    // "this launch is unauthorized": an OpenHands launch's own execution IS
    // the subscription itself, never a metered JSON call, so
    // disposition:"non_api" with billingKind:"subscription" is this gate's
    // actual success condition — "non_api_authorized" names a capability
    // that is real and authorized, just not reachable through the JSON
    // path; it does not mean "nothing may happen". The capability/workspace/
    // model/account identity is re-checked here too (never trusted merely
    // because the gate returned "ok") — belt-and-braces: this gate's own
    // synthetic catalog only ever has the one entry it just built from these
    // same values, so a mismatch should be structurally impossible, but
    // "aucun profil générique ne doit contourner contrôle compte/modèle/
    // approbation" is enforced explicitly here rather than assumed.
    const assessment = gate.status === "ok" ? gate.assessment : null;
    const subscriptionAuthorized =
      assessment !== null &&
      assessment.emit === false &&
      "disposition" in assessment &&
      assessment.disposition === "non_api" &&
      assessment.billingKind === "subscription" &&
      assessment.capability.accountId === accountId &&
      assessment.capability.workspaceId === context.workspaceId &&
      assessment.capability.modelId === modelId;
    const apiAuthorized = assessment !== null && assessment.emit === true;
    if (!apiAuthorized && !subscriptionAuthorized) {
      return { status: "model_emission_blocked", externalEffectAllowed: false, gate };
    }

    // Re-verify the approval immediately before delegating to the real
    // commit. Everything above (provider/model resolution, connection
    // discovery, the emission gate itself) can take real I/O time, during
    // which the approval this decision relied on could be revoked, replaced,
    // or expire — the gate's own TOCTOU note already names this exact gap
    // for the mission value; this closes the matching one for approval.
    // Re-reading right here narrows the window to the same irreducible kind
    // already accepted for the mission (between this re-read and
    // deps.launch's own CAS), not the much wider window across the whole
    // evaluation above. See approvalStillAuthorizes() for the identity check
    // itself (never status alone).
    const authorizedRecord = derivation.record;
    if (!authorizedRecord) {
      // Unreachable in practice — gate.assessment.emit===true implies
      // authorization.authorized===true implies derivation.record!==null
      // above — but a missing record here is treated exactly like a real
      // revocation, never assumed away.
      return { status: "approval_changed_before_commit", externalEffectAllowed: false };
    }
    if (authorizedRecord.approvedBy !== context.actorId || !config ||
      !missionApprovalBindingMatches(authorizedRecord.binding, mission, config, confirmation.expectedLaunchHash,
        { workspaceId: context.workspaceId, accountId, modelId, providerId: binding.registryProviderId,
          billingKind: "subscription", catalogRevision })) {
      return { status: "approval_binding_changed", externalEffectAllowed: false };
    }
    const recheck = await deps.loadApprovalRecord(missionId);
    if (!approvalStillAuthorizes(mission, authorizedRecord, recheck)) {
      return { status: "approval_changed_before_commit", externalEffectAllowed: false };
    }

    // Re-verify the attested account identity too, same moment, same
    // reasoning: the account this decision authorized could change,
    // disconnect, or lose its attestation in the gap between the FIRST
    // discovery above and this commit. Re-probing right here (never cached,
    // never assumed stable just because nothing else changed) narrows that
    // window the same way the approval re-check does — and, as a direct
    // consequence of checking isExecutionReady here, also closes the
    // connection-revocation gap this file's own TOCTOU note previously
    // flagged as NOT caught ("a connection lost in that same final narrow
    // window is still not caught"): it now is, for the account axis.
    const accountRecheckDiscovery = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: context.workspaceId,
      requestingWorkspaceId: context.workspaceId,
      probe: connectionProbe,
      nowIso: new Date(now()).toISOString(),
    });
    const accountRecheckEntry = accountRecheckDiscovery.status === "ok"
      ? accountRecheckDiscovery.snapshot.entries.find((entry) => entry.providerId === binding.registryProviderId) ?? null
      : null;
    if (!attestedAccountStillMatches(accountId, accountRecheckEntry)) {
      return { status: "account_identity_changed_before_commit", externalEffectAllowed: false };
    }

    return deps.launch(context, missionId, { ...confirmation, approvalRecordId: authorizedRecord.id });
  };
}
