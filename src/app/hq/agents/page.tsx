import { getAgentDisplayNames } from "@/features/agents/actions/display-names";
import type { Route } from "next";
import { Activity, BrainCircuit, Crosshair, Network, Send, ShieldCheck, Users } from "lucide-react";
import { buildAgentAutonomyCockpit } from "@/features/agents/agent-autonomy-cockpit";
import { buildCharterHealthReport } from "@/features/agents/agent-charter";
import { charterRegistry } from "@/features/agents/charter-seed";
import { AgentCharterPanel } from "@/features/agents/components/agent-charter-panel";
import { buildAgentKnowledgePackCatalog } from "@/features/agents/agent-knowledge-packs";
import { buildAgentQualityEvaluation } from "@/features/agents/agent-quality-evaluation";
import { reviewQueueFromQualityEvaluation } from "@/features/agents/agent-review-cockpit";
import { AgentAutonomyPolicyPanel } from "@/features/agents/components/agent-autonomy-policy-panel";
import { AgentCard } from "@/features/agents/components/agent-card";
import { AgentKnowledgePackPanel } from "@/features/agents/components/agent-knowledge-pack-panel";
import { AgentQualityEvaluationPanel } from "@/features/agents/components/agent-quality-evaluation-panel";
import { AgentReviewQueuePanel } from "@/features/agents/components/agent-review-queue-panel";
import { AgentSkillPanel } from "@/features/agents/components/agent-skill-panel";
import { ExecutionIntentReviewPanel } from "@/features/agents/components/execution-intent-review-panel";
import { getDefaultAgentAutonomyPolicy } from "@/features/agents/autonomy-policy";
import { agentRegistry } from "@/features/agents/seed";
import { validateAgentSkillMapping } from "@/features/agents/skill-mapping";
import { skillsCatalog } from "@/features/skills/seed";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import { listMissionsForWorkspace } from "@/server/missions";
import { AGENT_ACTIVITY_LIMIT, loadAgentRunObservation } from "@/features/workflows/agent-run-observation";
import { AgentRunHealthPanel } from "@/features/workflows/components/agent-run-health-panel";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import {
  HqMetric,
  HqPageHeader,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const access = await requireOwnerAccess("/hq/agents");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const naming = await getAgentDisplayNames();
  const agents = naming?.agents ?? agentRegistry;
  const active = agents.filter((a) => a.status === "active");
  const standby = agents.filter((a) => a.status === "standby");
  const locked = agents.filter((a) => a.status === "locked");
  const planned = agents.filter((a) => a.status === "planned");

  const mappingReport = validateAgentSkillMapping(agents, skillsCatalog);
  const charterHealth = buildCharterHealthReport(agents, charterRegistry);
  const autonomyCockpit = buildAgentAutonomyCockpit({
    agents,
    skills: skillsCatalog,
    policy: getDefaultAgentAutonomyPolicy(),
  });
  const knowledgePackCatalog = buildAgentKnowledgePackCatalog({
    agents,
    skills: skillsCatalog,
  });
  const nowMs = new Date().getTime();
  const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
  const observation = await loadAgentRunObservation(
    () => listActionLedgerForWorkspace({ workspaceId: activeWorkspace.id, limit: AGENT_ACTIVITY_LIMIT }),
    () => listMissionsForWorkspace({ workspaceId: activeWorkspace.id, modeId: activeMode.id }),
    nowMs,
  );
  const agentNames = Object.fromEntries(agents.map((agent) => [agent.id, agent.name]));

  const qualityEvaluation = buildAgentQualityEvaluation({
    knowledgeCatalog: knowledgePackCatalog,
    autonomyCockpit,
    observations: observation.observations,
  });

  // Derive the local review queue from the quality scorecards via the shared
  // cockpit signal builder (single source of truth — same derivation the
  // cockpit uses). Pure, deterministic; createdAt is pinned so the server
  // component renders stably (no Date.now() inside pure builders).
  const QUEUE_CREATED_AT = "2026-06-01T00:00:00.000Z";
  const reviewQueue = reviewQueueFromQualityEvaluation({
    qualityEvaluation,
    createdAt: QUEUE_CREATED_AT,
  });

  return (
    <CockpitShell active="agents" crumb="Agents">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Agent Registry"
        icon={Users}
        tone="violet"
        title="Registre des agents"
        description={
          <>
            Tous les agents Oria — orchestrateur, scouts, builders, closers, opérateurs, auditeur
            et finance. Aucun agent n&apos;agit sans mandat explicite. Ces statuts décrivent les profils configurés ; ils ne confirment pas la connexion des fournisseurs.
          </>
        }
      >
        <HqSummaryRail>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Résumé
          </p>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Profils activés" value={active.length} tone="emerald" />
            <HqMetric label="Standby" value={standby.length} tone="amber" />
            <HqMetric label="Verrouillés" value={locked.length} tone="rose" />
            <HqMetric label="Planifiés" value={planned.length} />
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      {naming?.status !== "available" && <p role="status" className="mb-4 rounded-xl border border-amber-500/20 p-3 text-sm text-amber-200">Noms par défaut affichés. Le stockage des noms personnalisés est indisponible ou non qualifié ; aucun renommage durable n’est activé.</p>}

      <HqWidget title="Chartes opérationnelles" eyebrow="ADN & ROI" icon={Crosshair}>
        <AgentCharterPanel charters={charterRegistry} health={charterHealth} />
      </HqWidget>

      <HqWidget title="Autonomie contrôlée" eyebrow="Policy" icon={ShieldCheck}>
        <AgentAutonomyPolicyPanel model={autonomyCockpit} />
      </HqWidget>

      <HqWidget title="Knowledge packs" eyebrow="Context" icon={BrainCircuit}>
        <AgentKnowledgePackPanel catalog={knowledgePackCatalog} />
      </HqWidget>

      <HqWidget title="Santé des runs" eyebrow="Runs réels — ledger" icon={Activity}>
        <AgentRunHealthPanel observation={observation} agentNames={agentNames} nowMs={nowMs} />
      </HqWidget>

      <HqWidget title="Qualité opérationnelle" eyebrow="Evaluation" icon={ShieldCheck}>
        {qualityEvaluation.summary.evidenceMode === "blueprint_baseline" && (
          <p className="mb-3 text-sm text-neutral-300">
            Baseline théorique — aucune qualité observée exploitable dans cette lecture.
            {observation.status !== "complete" && " Les données d’activité sont incomplètes ou indisponibles."}
          </p>
        )}
        <AgentQualityEvaluationPanel model={qualityEvaluation} />
      </HqWidget>

      <HqWidget title="Review queue" eyebrow="Operator loop" icon={Users}>
        {observation.status !== "complete" && (
          <p className="mb-3 text-sm text-neutral-300">Revue issue de la baseline théorique, sans conclusion sur les runs indisponibles.</p>
        )}
        <AgentReviewQueuePanel queue={reviewQueue} />
      </HqWidget>

      <HqWidget title="Intentions d'exécution" eyebrow="Rail gouverné — approbation CEO" icon={Send} tone="amber">
        <ExecutionIntentReviewPanel agentId="hermes" />
      </HqWidget>

      {[
        { label: "Profils activés", agents: active },
        { label: "Standby", agents: standby },
        { label: "Verrouillés", agents: locked },
        { label: "Planifiés", agents: planned },
      ]
        .filter(({ agents }) => agents.length > 0)
        .map(({ label, agents }) => (
          <HqWidget key={label} title={label} eyebrow="Agents" icon={Users}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <AgentCard key={`${naming?.workspaceId}:${agent.id}`} agent={agent} naming={{ available: naming?.status === "available", defaultName: agentRegistry.find(item => item.id === agent.id)?.name ?? agent.name }} />
              ))}
            </div>
          </HqWidget>
        ))}
      <HqWidget title="Mapping Agent → Skills" eyebrow="Control map" icon={Network}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
              mappingReport.valid
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/20 bg-amber-500/10 text-amber-300"
            }`}
          >
            {mappingReport.valid ? "Cohérent" : "Mismatches détectés"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mappingReport.results.map((result) => (
            <AgentSkillPanel key={result.agent.id} result={result} />
          ))}
        </div>

        {mappingReport.unclaimed.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-xs font-semibold text-amber-300">
              Skills non revendiquées par aucun agent
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {mappingReport.unclaimed.map((id) => (
                <li
                  key={id}
                  className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-300"
                >
                  {id}
                </li>
              ))}
            </ul>
          </div>
        )}
      </HqWidget>
    </CockpitShell>
  );
}
