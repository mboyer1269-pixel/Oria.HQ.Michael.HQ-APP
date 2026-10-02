// src/server/missions/model-emission-launch-gate.ts
//
// Wraps the REAL OpenHands launch caller — createConfiguredOpenHandsLaunch(),
// the exact function src/app/api/orchestration/openhands/route.ts passes as
// `launch` into createOpenHandsHandler() — with the account/capability gate,
// at the one moment that actually commits something: the "confirm_launch"
// action (confirmation.confirm === true). A "prepare_launch" preview commits
// nothing and is passed straight through.
//
// CORRECTNESS RULE THIS FILE EXISTS TO ENFORCE (caught in review before this
// landed): the gate MUST check the connection of the provider actually named
// by the CONFIRMED plan's own configuration — never an independent constant.
// An earlier version of this file checked a synthetic "openai-codex via
// Hermes" registry entry that had NO relationship to what the real launch
// config executes. src/core/openhands-launch-contract.ts's providerProfile
// is `provider: z.literal("claude")` — the real OpenHands executor this
// codebase can configure today is a Claude Code CLI subscription runner,
// NOT the Hermes/Codex account. Validating "Codex is connected" and then
// launching a Claude-configured worker would be exactly the wrong-account
// bug this module must refuse, not commit.
//
// So: this gate derives the provider to check FROM
// ORIA_OPENHANDS_LAUNCH_CONFIG (the same server-side config
// createConfiguredOpenHandsLaunch() itself reads — re-read here, not cached,
// not duplicated as a second source of truth). If that config is absent, un-
// parseable, or carries no providerProfile, there is no real account binding
// to check — this gate refuses explicitly ("no_provider_binding") rather
// than silently letting an unbound plan through. If the resolved provider is
// not one this gate's registry/probe actually knows how to verify, it
// refuses explicitly ("plan_executor_mismatch") rather than falling back to
// whatever account happens to be wired in. No live probe exists yet for the
// "claude" executor account (that would need to run on the OpenHands runner
// host, not Michael's laptop and not the Hermes VPS — see the header note on
// DEFAULT_UNVERIFIABLE_PROBE below), so with no connectionProbe supplied this
// gate refuses every confirm_launch today. That is the correct, honest
// behavior: it does not claim a real chain where none is wired.
//
// TOCTOU note: this gate re-reads the launch config, the approval record,
// and the connection snapshot fresh on every call — nothing is cached across
// calls. The remaining gap is the narrow window between this gate's reads
// and the real launch service's own compareAndSwap: that CAS already
// protects against a stale MISSION value (status/updatedAt/input must still
// match), but an approval record revoked or a connection lost in that same
// narrow window is NOT caught by this lot. Closing that fully would need a
// transactional read shared with openhands-launch.ts's own store, which is
// out of scope here and not invented as a new layer.
//
// Reuses, never duplicates:
//   - launchConfigSchema (core/openhands-launch-contract.ts) to parse the
//     SAME config source createConfiguredOpenHandsLaunch() reads.
//   - deriveMissionApprovalConfirmation (approval-derivation.ts).
//   - getMissionApprovalRecord (approval-record-repository.ts).
//   - resolveProviderConnectionDiscovery + evaluateModelEmissionGate (this lot).
//   - whatever `launch` function is injected — createConfiguredOpenHandsLaunch
//     unmodified.

import type { Mission } from "@/core/types";
import { launchConfigSchema, type LaunchConfig } from "@/core/openhands-launch-contract";
import { deriveMissionApprovalConfirmation } from "./approval-derivation";
import type { MissionApprovalRecord } from "./approval-record";
import {
  evaluateModelEmissionGate,
  type ModelEmissionAuthorizationDecision,
  type ModelEmissionGateResult,
} from "./model-emission-gate";
import { createStaticProviderRegistry } from "../agents/models/provider-registry-contract";
import {
  resolveProviderConnectionDiscovery,
  type ProviderConnectionProbe,
} from "../agents/models/provider-connection-discovery";
import type { ProviderRegistry } from "../agents/models/provider-registry-contract";

// ---------------------------------------------------------------------------
// The ONLY executor provider a real LaunchConfig can name today
// ---------------------------------------------------------------------------
//
// providerProfileSchema.provider is `z.literal("claude")` — not an open
// enum. This map exists so adding a second literal to that schema is the
// only change needed here too; nothing here invents a provider the schema
// does not already allow.

const PROVIDER_PROFILE_TO_REGISTRY_PROVIDER_ID: Readonly<Record<string, string>> = {
  claude: "claude-code-cli",
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
  ],
});

if (!EXECUTOR_PROVIDER_REGISTRY_RESULT.ok) {
  throw new Error(
    `executor provider registry is invalid: ${EXECUTOR_PROVIDER_REGISTRY_RESULT.errors.join("; ")}`,
  );
}

/** The one known-verifiable executor provider today: "claude-code-cli". Not a general catalog. */
export const DEFAULT_EXECUTOR_PROVIDER_REGISTRY: ProviderRegistry = EXECUTOR_PROVIDER_REGISTRY_RESULT.registry;

/**
 * Honest default: no code in this repository verifies the OpenHands
 * runner's own Claude Code CLI login state today (local-runtime-probe.ts
 * checks Michael's LAPTOP; the Hermes SSH probe checks a DIFFERENT
 * account entirely — "openai-codex", which no LaunchConfig can name). So
 * absent a real probe, every provider resolves to "unknown" with a
 * requiredAction that names exactly what is missing, rather than silently
 * reusing an unrelated account's connection state.
 */
export const DEFAULT_UNVERIFIABLE_PROBE: ProviderConnectionProbe = async (provider) => ({
  connectionState: "unknown",
  source: "declared-capability",
  requiredAction:
    `no real connection probe is wired for provider "${provider.id}" on the OpenHands runner host — ` +
    "this must check the runner's own account state, not Michael's laptop (local-runtime-probe.ts) " +
    "or an unrelated account (hermes-codex-connection-probe.ts checks \"openai-codex\", which no " +
    "LaunchConfig.providerProfile can name)",
  evidence: [],
});

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

// ---------------------------------------------------------------------------
// The gate wrapper
// ---------------------------------------------------------------------------

export type OpenHandsLaunchFn = (
  context: { workspaceId: string; actorId: string },
  missionId: string,
  confirmation?: { expectedLaunchHash: string; confirm: true },
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
  | { status: "model_emission_blocked"; externalEffectAllowed: false; gate: ModelEmissionGateResult };

function defaultLoadLaunchConfig(): LaunchConfig | null {
  const raw = process.env.ORIA_OPENHANDS_LAUNCH_CONFIG;
  if (!raw || Buffer.byteLength(raw, "utf8") > 4096) return null;
  try {
    const parsed = launchConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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
  const connectionProbe = deps.connectionProbe ?? DEFAULT_UNVERIFIABLE_PROBE;
  const loadLaunchConfig = deps.loadLaunchConfig ?? defaultLoadLaunchConfig;
  const now = deps.now ?? Date.now;

  return async (context, missionId, confirmation) => {
    if (!confirmation) {
      return deps.launch(context, missionId, confirmation);
    }

    const mission = await deps.loadMission(context.workspaceId, missionId);
    if (!mission) {
      // Refuse, do not delegate: see the TOCTOU note above this function.
      return { status: "mission_unavailable_for_gate", externalEffectAllowed: false };
    }

    const config = loadLaunchConfig();
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

    const nowMs = now();
    const discovery = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: context.workspaceId,
      requestingWorkspaceId: context.workspaceId,
      probe: connectionProbe,
      nowIso: new Date(nowMs).toISOString(),
    });
    const connectionSnapshot = discovery.status === "ok" ? discovery.snapshot : null;

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
      nowMs,
    });

    if (gate.status !== "ok" || gate.assessment.emit !== true) {
      return { status: "model_emission_blocked", externalEffectAllowed: false, gate };
    }

    return deps.launch(context, missionId, confirmation);
  };
}
