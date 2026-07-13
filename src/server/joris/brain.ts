import type { CommandResult, JorisIntent, MissionPlanResult } from "@/core/types";
import { getActiveWorkspaceContext, type WorkspaceContext } from "@/core/workspace-context";
import { logger } from "@/lib/logger";
import { chooseModel } from "@/server/ai/model-router";
import type { TaskClass } from "@/server/ai/cost-ladder";
import { buildCeoBriefSnapshot } from "@/server/brief/ceo-brief-service";
import { parseCalendarIntent } from "@/server/calendar/intent-parser";
import { checkPermission } from "@/server/permissions/permissions";
import {
  buildDryRunMissionExecutionPlan,
  listMissionsForWorkspace,
  resolveMissionFromText,
} from "@/server/missions";
import { deriveMissionApprovalConfirmation } from "@/server/missions/approval-derivation";
import { classifyMissionDraftReply } from "@/server/missions/mission-draft-confirmation";
import {
  cancelPendingMissionDraft,
  confirmPendingMissionDraft,
} from "@/server/missions/mission-draft-control";
import { formatMissionDraftProposalSummary } from "@/server/missions/mission-draft-builder";
import { getPendingMissionDraft, setPendingMissionDraft } from "@/server/missions/mission-draft-session";
import { detectIntent } from "@/server/joris/detect-intent";
import { handleMarketplaceListingIntent } from "@/server/joris/marketplace-listing-intent";
import { handleInventoryMarketIntent } from "@/server/joris/inventory-market-intent";
import { handleSalesMarketingIntent } from "@/server/joris/sales-marketing-intent";
import {
  handleMarketplaceBatchPrepareIntent,
  handleMarketplaceMarkPublishedIntent,
  handleSalesLeadCaptureIntent,
  handleSalesMorningQueueIntent,
  handleSalesOperatorBriefIntent,
} from "@/server/joris/sales-operator-intent";
import { generateJorisReply, type JorisReplyResult } from "@/server/joris/joris-reply-generator";
import { routeMissionRequest } from "@/server/joris/mission-router";
import { formatMissionRouterResponse } from "@/server/joris/mission-router-response";
import { buildJorisGovernanceBundlePreview } from "@/server/joris/governance-bundle-preview";
import {
  clearPendingGovernanceBundle,
  getPendingGovernanceBundle,
  setPendingGovernanceBundle,
} from "@/server/joris/governance-bundle-session";
import { applyReviewToGovernanceBundle } from "@/server/joris/governance-bundle-review-applicator";
import { buildGovernanceDecisionRecord } from "@/server/agents/work-order-governance-decision-contract";
import {
  getGovernanceDecisionsForWorkspace,
  recordGovernanceDecision,
} from "@/server/joris/governance-decision-repository";
import {
  buildGovernanceAuditReport,
  formatGovernanceAuditReportCsv,
} from "@/server/joris/governance-audit-report";
import {
  buildWorkOrderGovernancePlan,
  formatWorkOrderGovernancePlan,
  isBundleApprovedToPlan,
} from "@/server/agents/work-order-governance-plan";
import { buildGovernanceDecisionContinuityNote } from "@/server/joris/governance-decision-continuity";
import { composeVerifiedLessonsContext } from "@/server/agents/context/verified-lessons-context";
import { readVerifiedVaultContext } from "@/server/memory/memory-vault-repository";
import {
  enrichJorisMemoryContextWithMemex,
  type MemexContextEnrichmentResult,
} from "@/server/joris/memex-context-source";
import {
  buildMemexMemoryEvidenceObservabilityPayload,
  MEMEX_EVIDENCE_OBSERVABILITY_LOG_EVENT,
  withMemexEvidencePreview,
} from "@/server/joris/memex-memory-evidence-summary";
import type { MemoryVaultReadResult } from "@/server/memory/memory-vault-types";

const DEFAULT_GOVERNANCE_AUDIT_LIMIT = 500;

/**
 * Pure intent → Cost Ladder task class map (shadow tagging — Option A).
 *
 * This drives the ladder's *observed* decision only; it changes no provider
 * call and the capability stays `display_only`. The two high-value judgment
 * intents carry the premium-mandatory `client_audit` floor (never downgraded,
 * even in economy mode or under budget pressure). Every other intent is
 * `general`, which defers to the base router — so the displayed model is
 * unchanged and the ladder simply becomes observable (`via: "cost-ladder"` plus
 * a recorded cost event). No free model is ever forced here: the free rung
 * stays config-gated and empty until a later (dispatch) phase.
 *
 * `client_audit` is reused as the only existing premium-floor class; the tag is
 * a routing-tier signal, not a claim that these intents are literal audits.
 */
const INTENT_TASK_CLASS: Record<JorisIntent, TaskClass> = {
  "board.consult": "client_audit",
  "opportunity.score": "client_audit",
  chat: "general",
  "calendar.book": "general",
  "calendar.remind": "general",
  "brief.generate": "general",
  "memory.capture": "general",
  "task.create": "general",
  "mission.plan": "general",
  "mission.draft": "general",
  "governance.audit": "general",
  "marketplace.listing.prepare": "general",
  "marketplace.listing.prepare_batch": "general",
  "marketplace.mark_published": "general",
  "sales.marketing.prepare": "general",
  "sales.lead.capture": "general",
  "sales.morning.queue": "general",
  "sales.operator.brief": "general",
  "inventory.market.brief": "general",
};

/** Conservative, pure mapping from a detected intent to its shadow task class. */
export function taskClassForIntent(intent: JorisIntent): TaskClass {
  return INTENT_TASK_CLASS[intent] ?? "general";
}

/**
 * Formats verified Memory Vault entries as a concise context note for Joris.
 * Returns null when no entries are available (no noise on empty vault).
 */
function buildVaultContextNote(vault: MemoryVaultReadResult): string | null {
  if (vault.entries.length === 0) return null;

  const lines = vault.entries.map((e) => `[${e.type.toUpperCase()}] ${e.title}: ${e.content}`);
  return `--- Mémoire opérationnelle (${vault.entries.length} entrée${vault.entries.length > 1 ? "s" : ""} vérifiée${vault.entries.length > 1 ? "s" : ""}) ---\n${lines.join("\n")}\n---`;
}

function buildFallbackSummary(intent: JorisIntent, message: string) {
  if (intent === "board.consult") {
    return "Je vais traiter ça comme une décision stratégique: Board activé, synthèse par Joris, puis une seule action prioritaire. La connexion modèle premium sera branchée côté serveur ensuite.";
  }

  if (intent === "opportunity.score") {
    return "Je capte une opportunité business. Je vais la scorer sur revenu, effort, focus, risque et vitesse de test avant de la mettre dans l’Opportunity Log.";
  }

  return `Reçu, CEO. Je garde ça en contexte et je le traiterai en français québécois canadien: ${message}`;
}

async function handleMissionDraftReply(
  message: string,
  ctx: WorkspaceContext,
  route: ReturnType<typeof chooseModel>,
  workspaceMeta: Pick<CommandResult, "workspaceId" | "modeId" | "assistantId">,
): Promise<CommandResult | null> {
  const replyKind = classifyMissionDraftReply(message);
  if (replyKind === "none") return null;

  if (replyKind === "cancel") {
    return cancelPendingMissionDraft(ctx);
  }

  if (replyKind === "ambiguous") {
    const pending = getPendingMissionDraft(ctx.workspace.id, ctx.userId);
    if (pending) {
      return {
        intent: "mission.draft",
        summary:
          "Ta réponse mélange confirmation et nouvelle demande calendrier. Réponds seulement « confirme », « oui » ou « go » pour booker la mission draft en cours, ou « annule » pour abandonner.",
        modelId: route.model.id,
        costMode: route.mode,
        ...workspaceMeta,
        missionDraftPreview: pending.preview,
        pendingDraftId: pending.pendingDraftId,
        requiresConfirmation: true,
      };
    }

    return null;
  }

  return confirmPendingMissionDraft(ctx);
}

/**
 * Applies a CEO review message to a pending preview-state Governance Bundle
 * (PR130). Pure, read-only, dry-run: it advances the bundle's review session
 * via the applicator and returns a read-only summary. It NEVER books, persists,
 * confirms, or dispatches, and approve_to_plan stays planning-only.
 *
 * Returns null (so normal intent routing proceeds) when:
 *   - a calendar mission draft is pending — booking owns overlap tokens like
 *     "go"/"oui", so governance defers to preserve the booking flow;
 *   - no pending governance bundle exists for this (workspace, user);
 *   - the message is not a review (interpreted as ambiguous) — likely a new
 *     request, so the pending bundle is left intact for normal routing.
 *
 * When a decision (or a safety block) is rendered, the pending bundle is
 * cleared: one decision per preview closes the dry-run loop; re-preview to
 * continue.
 */
async function handleGovernanceReviewReply(
  message: string,
  ctx: WorkspaceContext,
  route: ReturnType<typeof chooseModel>,
  workspaceMeta: Pick<CommandResult, "workspaceId" | "modeId" | "assistantId">,
): Promise<CommandResult | null> {
  // Booking precedence: defer to the mission-draft confirmation path when a
  // calendar draft is pending.
  if (getPendingMissionDraft(ctx.workspace.id, ctx.userId)) {
    return null;
  }

  const pending = getPendingGovernanceBundle(ctx.workspace.id, ctx.userId);
  if (!pending) {
    return null;
  }

  const application = applyReviewToGovernanceBundle({
    bundle: pending.bundle,
    message,
    reviewerId: ctx.userId,
    reviewerRole: pending.bundle.reviewSession.reviewerRole,
  });

  // Ambiguous = not a review. Leave the pending bundle intact and let normal
  // intent routing handle the message (e.g. a brand-new opportunity).
  if (application.intent === "ambiguous") {
    return null;
  }

  // A decision or safety block closes the dry-run loop for this preview.
  clearPendingGovernanceBundle(ctx.workspace.id, ctx.userId);

  // Persist the rendered decision as an audit record (best-effort, dry-run).
  // This records that a planning decision was made — it authorizes nothing.
  // Persistence must never break the read-only governance response, so a
  // failure (e.g. production without a Supabase implementation) is swallowed.
  try {
    await recordGovernanceDecision(
      buildGovernanceDecisionRecord({
        bundle: application.bundle,
        workspaceId: ctx.workspace.id,
        reviewerId: ctx.userId,
      }),
    );
  } catch (err) {
    // Audit persistence is best-effort; the dry-run response still stands.
    logger.warn("governance.decision.persist.failed", {
      workspaceId: ctx.workspace.id,
      reviewerId: ctx.userId,
      reason: err instanceof Error ? err.message : "unknown",
    });
  }

  // On approved_to_plan, append a self-contained DRY-RUN planning representation
  // derived from the Work Order + Autonomy Envelope. This is planning only — it
  // touches no mission/runtime path, authorizes nothing, and requires no
  // confirmation. approve_to_plan stays planning-only.
  let summary = application.message;
  if (isBundleApprovedToPlan(application.bundle)) {
    const plan = buildWorkOrderGovernancePlan({ bundle: application.bundle });
    summary = `${summary}\n\n${formatWorkOrderGovernancePlan(plan)}`;
  }

  return {
    intent: "opportunity.score",
    summary,
    modelId: route.model.id,
    costMode: route.mode,
    ...workspaceMeta,
    requiresConfirmation: false,
  };
}

/** Injectable dependencies — lets tests supply a mock LLM reply / vault (no network). */
export type RunJorisCommandDeps = {
  generateReply: (input: { message: string; memoryContext?: string | null }) => Promise<JorisReplyResult>;
  /** Verified-vault reader; defaults to the real one. Injectable for tests. */
  readVerifiedVault?: (workspaceId: string) => MemoryVaultReadResult;
  /** Optional Memex read-only enrichment — defaults to env-gated stdio client. */
  enrichMemexContext?: (input: {
    existingContext: string | null;
    taskIntent: string;
    workspaceId: string;
  }) => Promise<MemexContextEnrichmentResult>;
};

const defaultRunJorisCommandDeps: RunJorisCommandDeps = {
  generateReply: generateJorisReply,
  readVerifiedVault: readVerifiedVaultContext,
  enrichMemexContext: enrichJorisMemoryContextWithMemex,
};

export async function runJorisCommand(
  message: string,
  workspaceContext: WorkspaceContext = getActiveWorkspaceContext(),
  deps: RunJorisCommandDeps = defaultRunJorisCommandDeps,
): Promise<CommandResult> {
  const ctx = workspaceContext;

  // Memory Vault — read verified entries at the start of every brain invocation.
  // Workspace-scoped, verified only, max 20 entries (contract §Joris read rules).
  // This context is available to all downstream handlers in this invocation.
  const vaultContext = (deps.readVerifiedVault ?? readVerifiedVaultContext)(ctx.workspace.id);
  const vaultNote = buildVaultContextNote(vaultContext);

  // Verified lessons rail — advisory block composed from the same verified
  // read, filtered to lessons concerning the active agent, capped and
  // sanitized. Subordinate to system rules by construction; the trace is
  // non-sensitive (ids and counts only, never lesson content).
  const lessonsRail = composeVerifiedLessonsContext({
    entries: vaultContext.entries,
    agentId: ctx.activeAgentProfile.id,
  });
  if (lessonsRail.block) {
    logger.info("joris.memory.lessons.rail", { ...lessonsRail.trace });
  }
  let memoryContext = [vaultNote, lessonsRail.block].filter(Boolean).join("\n\n") || null;

  const memexEnrichment = await (deps.enrichMemexContext ?? enrichJorisMemoryContextWithMemex)({
    existingContext: memoryContext,
    taskIntent: message,
    workspaceId: ctx.workspace.id,
  });
  if (memexEnrichment.trace.status === "enriched" && memexEnrichment.memoryContext !== null) {
    memoryContext = memexEnrichment.memoryContext;
  }
  logger.info(
    MEMEX_EVIDENCE_OBSERVABILITY_LOG_EVENT,
    buildMemexMemoryEvidenceObservabilityPayload({
      summary: memexEnrichment.evidenceSummary,
      evidencePackValid: memexEnrichment.trace.evidencePackValid ?? false,
    }),
  );

  const attachMemexPreview = (summaryText: string, intent: JorisIntent) =>
    withMemexEvidencePreview(summaryText, {
      intent,
      memoryContext,
      evidenceSummary: memexEnrichment.evidenceSummary,
    });

  const route = chooseModel({
    message,
    highImpact: false,
    // Shadow tagging (Cost Ladder, display_only): the pre-intent reply route
    // (governance / mission-draft confirmations) is always tagged conservatively
    // `general` — a confirmation reply must never inherit a premium or free tag
    // from its own keywords. `general` defers to the base router, so the
    // displayed model is unchanged; only `via` + the cost event become observable.
    taskClass: "general",
    agentId: ctx.activeAgentProfile.id,
  });

  const workspaceMeta = {
    workspaceId: ctx.workspace.id,
    modeId: ctx.activeMode.id,
    assistantId: ctx.activeAgentProfile.id,
  };

  // Governance review reply runs before the mission-draft reply so that, when
  // only a governance bundle is pending, review verbs ("approuve", "rejette",
  // "modifie"…) advance the dry-run governance session. It internally defers to
  // booking when a calendar draft is pending, preserving the confirmation flow.
  const governanceReplyResult = await handleGovernanceReviewReply(message, ctx, route, workspaceMeta);
  if (governanceReplyResult) {
    return governanceReplyResult;
  }

  const draftReplyResult = await handleMissionDraftReply(message, ctx, route, workspaceMeta);
  if (draftReplyResult) {
    return draftReplyResult;
  }

  const intent = detectIntent(message);
  const routedModel = chooseModel({
    message,
    highImpact: intent === "board.consult" || intent === "opportunity.score",
    // Shadow tagging (Cost Ladder, display_only): map the detected intent to a
    // task class so the ladder produces an *observed* decision. High-value
    // judgment intents carry the premium-mandatory `client_audit` floor; every
    // other intent is `general` (defers to the base router). No free model is
    // forced — the free rung stays config-gated/empty in this phase.
    taskClass: taskClassForIntent(intent),
    agentId: ctx.activeAgentProfile.id,
  });

  if (intent === "governance.audit") {
    let degraded = false;
    let decisions: Awaited<ReturnType<typeof getGovernanceDecisionsForWorkspace>> = [];

    try {
      decisions = await getGovernanceDecisionsForWorkspace(workspaceMeta.workspaceId, {
        limit: DEFAULT_GOVERNANCE_AUDIT_LIMIT,
      });
    } catch {
      degraded = true;
    }

    const report = buildGovernanceAuditReport({
      workspaceId: workspaceMeta.workspaceId,
      decisions,
    });
    const csv = formatGovernanceAuditReportCsv(report);
    const filename = `governance-audit-${workspaceMeta.workspaceId}-${report.generatedAt.slice(0, 10)}.csv`;
    const summary = degraded
      ? `J'ai préparé un export CSV d'audit de gouvernance en lecture seule avec ${report.totalDecisions} décision(s), limité aux ${DEFAULT_GOVERNANCE_AUDIT_LIMIT} dernières décisions max. Le backend de persistance était indisponible, donc l'export peut être vide. Aucune exécution n'est autorisée par ce rapport.`
      : `J'ai préparé un export CSV d'audit de gouvernance en lecture seule avec ${report.totalDecisions} décision(s), limité aux ${DEFAULT_GOVERNANCE_AUDIT_LIMIT} dernières décisions max. Aucune exécution n'est autorisée par ce rapport.`;

    return {
      intent,
      summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
      auditExport: {
        filename,
        mimeType: "text/csv",
        content: csv,
        totalDecisions: report.totalDecisions,
        humanOnTheLoop: true,
        noExecutionAuthorized: true,
      },
    };
  }

  if (intent === "opportunity.score") {
    const result = routeMissionRequest(message, ctx.userId);
    const workOrderSummary = formatMissionRouterResponse(result);

    // Read-only governance preview (PR127). Pure, dry-run: builds a
    // preview-state Governance Bundle from the routed Work Order and appends
    // its Markdown summary. No persistence, no confirmation, no execution —
    // approve_to_plan stays planning-only and requiresConfirmation remains false.
    const governancePreview = buildJorisGovernanceBundlePreview({
      workOrder: result.workOrder,
      reviewerId: ctx.userId,
      reviewerRole: "ceo",
    });

    // Store the preview-state bundle in-memory so a later CEO review message
    // can be applied to it (PR128/PR130). Storing a preview is not execution:
    // it is a dry-run snapshot, requiresConfirmation stays false, and nothing
    // is booked, persisted, or dispatched.
    setPendingGovernanceBundle({
      workspaceId: ctx.workspace.id,
      userId: ctx.userId,
      bundle: governancePreview.bundle,
    });

    // Continuity context (read side of the audit trail, PR132 wrote it):
    // surface the workspace's recent governance decisions so the CEO reviews
    // the new bundle with history in view. Best-effort and read-only — it
    // reflects PRIOR decisions (a preview records none), authorizes nothing,
    // and degrades to no note if the repository is unavailable.
    const continuityNote = await buildGovernanceDecisionContinuityNote({
      workspaceId: ctx.workspace.id,
    });

    const summary = continuityNote
      ? `${workOrderSummary}\n\n${governancePreview.message}\n\n${continuityNote}`
      : `${workOrderSummary}\n\n${governancePreview.message}`;

    return {
      intent,
      summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "brief.generate") {
    const brief = await buildCeoBriefSnapshot();
    const briefSummary = memoryContext
      ? `${brief.headline} ${brief.focusLine}\n\n${memoryContext}`
      : `${brief.headline} ${brief.focusLine}`;

    return {
      intent,
      summary: attachMemexPreview(briefSummary, "brief.generate"),
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "marketplace.listing.prepare") {
    const listing = await handleMarketplaceListingIntent({
      workspaceId: ctx.workspace.id,
      message,
    });
    return {
      intent,
      summary: listing.summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "sales.marketing.prepare") {
    const marketing = await handleSalesMarketingIntent({
      workspaceId: ctx.workspace.id,
      message,
    });
    return {
      intent,
      summary: marketing.summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "sales.morning.queue") {
    const queue = await handleSalesMorningQueueIntent({ workspaceId: ctx.workspace.id });
    return {
      intent,
      summary: queue.summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "sales.operator.brief") {
    const brief = await handleSalesOperatorBriefIntent({ workspaceId: ctx.workspace.id });
    return {
      intent,
      summary: brief.summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "marketplace.listing.prepare_batch") {
    const batch = await handleMarketplaceBatchPrepareIntent({
      workspaceId: ctx.workspace.id,
      message,
    });
    return {
      intent,
      summary: batch.summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "marketplace.mark_published") {
    const marked = handleMarketplaceMarkPublishedIntent({
      workspaceId: ctx.workspace.id,
      message,
    });
    return {
      intent,
      summary: marked.summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "sales.lead.capture") {
    const captured = handleSalesLeadCaptureIntent({
      workspaceId: ctx.workspace.id,
      message,
      createdByUserId: ctx.userId,
    });
    return {
      intent,
      summary: captured.summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "inventory.market.brief") {
    const market = await handleInventoryMarketIntent({
      workspaceId: ctx.workspace.id,
      message,
    });
    return {
      intent,
      summary: market.summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "calendar.book") {
    const calendarIntent = parseCalendarIntent(message);
    const permission = checkPermission("calendar-simple");

    if (!permission.allowed) {
      return {
        intent,
        summary: `Je ne peux pas exécuter cette action sans confirmation: ${permission.reason}`,
        modelId: routedModel.model.id,
        costMode: routedModel.mode,
        ...workspaceMeta,
        requiresConfirmation: true,
      };
    }

    if (calendarIntent) {
      const pending = setPendingMissionDraft({
        workspaceId: ctx.workspace.id,
        userId: ctx.userId,
        calendarIntent,
        modelId: routedModel.model.id,
        costMode: routedModel.mode,
      });

      return {
        intent: "mission.draft",
        summary: formatMissionDraftProposalSummary(pending.preview),
        modelId: routedModel.model.id,
        costMode: routedModel.mode,
        ...workspaceMeta,
        calendarIntent,
        missionDraftPreview: pending.preview,
        pendingDraftId: pending.pendingDraftId,
        requiresConfirmation: true,
      };
    }

    return {
      intent,
      summary: "Il me manque l’heure ou la date pour booker ça proprement. Donne-moi au moins l’heure, puis je le crée sans friction.",
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "mission.plan") {
    const { missions } = await listMissionsForWorkspace({
      workspaceId: ctx.workspace.id,
      modeId: ctx.activeMode.id,
    });

    const resolved = resolveMissionFromText(message, missions);

    if (!resolved.found) {
      if (resolved.reason === "ambiguous") {
        const list = resolved.candidates.map((m) => `• "${m.title}" (${m.id})`).join("\n");
        return {
          intent,
          summary: `Plusieurs missions correspondent. Précise laquelle :\n${list}`,
          modelId: routedModel.model.id,
          costMode: routedModel.mode,
          ...workspaceMeta,
          requiresConfirmation: false,
        };
      }
      const available = resolved.available
        .map((m) => `• "${m.title}" — ${m.status} (${m.id})`)
        .join("\n");
      return {
        intent,
        summary: available
          ? `Aucune mission trouvée pour ta demande. Missions disponibles :\n${available}`
          : "Aucune mission active dans ce workspace.",
        modelId: routedModel.model.id,
        costMode: routedModel.mode,
        ...workspaceMeta,
        requiresConfirmation: false,
      };
    }

    const { mission } = resolved;

    const approvalDerivation = deriveMissionApprovalConfirmation(mission, null);

    const planResult = buildDryRunMissionExecutionPlan({
      mission,
      mode: "dry_run",
      approvalDerivation,
    });

    const missionPlanResult: MissionPlanResult = planResult.allowed
      ? {
          allowed: true,
          missionId: mission.id,
          stepCount: planResult.plan.steps.length,
          estimatedAutonomyCost: planResult.plan.estimatedAutonomyCost,
        }
      : {
          allowed: false,
          missionId: mission.id,
          blockReasons: planResult.blockReasons,
        };

    const summary = planResult.allowed
      ? [
          `Plan dry-run pour "${mission.title}" :`,
          `- ${planResult.plan.steps.length} étape(s) planifiée(s)`,
          `- Coût autonomie estimé : ${planResult.plan.estimatedAutonomyCost}/5`,
          `- Approbation requise : ${planResult.approvalEvaluation.required ? "oui" : "non"}`,
          `→ Prêt à exécuter sur confirmation explicite uniquement.`,
        ].join("\n")
      : [
          `Mission "${mission.title}" bloquée :`,
          ...planResult.blockReasons.map((r) => `- ${r}`),
          `→ Ce plan ne peut pas être exécuté dans l'état actuel.`,
        ].join("\n");

    return {
      intent,
      summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: true,
      missionPlanResult,
    };
  }

  // Conversational catch-all (chat / board.consult / reminders). Attempt a real
  // LLM reply via the shared provider; when no provider is configured (no API
  // keys) or the call fails, fall back to a deterministic summary. The result is
  // labelled (`generation`) so nothing claims "AI mode" when rules produced it.
  const llmReply = await deps.generateReply({ message, memoryContext });
  if (llmReply.ok) {
    // Preserve the deterministic verified-memory/lessons rail verbatim by
    // appending it OUTSIDE the LLM (board.consult), so the audit block is
    // guaranteed in the summary rather than left to the model to reproduce.
    const summary =
      intent === "board.consult" && memoryContext
        ? `${llmReply.text}\n\n${memoryContext}`
        : llmReply.text;
    return {
      intent,
      summary: attachMemexPreview(summary, intent),
      modelId: llmReply.modelId,
      // The shared provider uses a low-cost default model; report an honest
      // conservative cost mode rather than the routed (possibly premium) one.
      costMode: "economy",
      ...workspaceMeta,
      requiresConfirmation: false,
      generation: "llm",
    };
  }

  const fallbackSummary = buildFallbackSummary(intent, message);
  const finalSummary =
    intent === "board.consult" && memoryContext
      ? `${fallbackSummary}\n\n${memoryContext}`
      : fallbackSummary;

  return {
    intent,
    summary: attachMemexPreview(finalSummary, intent),
    modelId: routedModel.model.id,
    costMode: routedModel.mode,
    ...workspaceMeta,
    requiresConfirmation: false,
    generation: "fallback",
  };
}
