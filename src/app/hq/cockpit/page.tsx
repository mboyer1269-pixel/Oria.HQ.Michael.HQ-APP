import { Activity } from "lucide-react";
import { buildCockpitReviewSignal } from "@/features/agents/agent-review-cockpit";
import { getDefaultAgentAutonomyPolicy } from "@/features/agents/autonomy-policy";
import { agentRegistry } from "@/features/agents/seed";
import { skillsCatalog } from "@/features/skills/seed";
import { AgentApprovalPreviewPanel } from "@/features/cockpit/components/agent-approval-preview-panel";
import { CockpitOverview } from "@/features/cockpit/components/cockpit-overview";
import { CockpitReviewQueue } from "@/features/cockpit/components/cockpit-review-queue";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { ControlChain } from "@/features/cockpit/components/control-chain";
import { VentureSuggestions } from "@/features/cockpit/components/venture-suggestions";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { requireOwnerAccess } from "@/server/auth/owner";

export const dynamic = "force-dynamic";

// createdAt is pinned so the pure review-queue builders render the server
// component deterministically (no Date.now() inside the builders).
const COCKPIT_CREATED_AT = "2026-06-01T00:00:00.000Z";
const COCKPIT_APPROVAL_EVENT_EXPIRES_AT = "2026-06-08T00:00:00.000Z";

export default async function CockpitPage() {
  const access = await requireOwnerAccess("/hq/cockpit");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  // Real local signal: run the governance chain over the agent registry.
  const { reviewQueue, attention, approvalPreview } = buildCockpitReviewSignal({
    agents: agentRegistry,
    skills: skillsCatalog,
    policy: getDefaultAgentAutonomyPolicy(),
    createdAt: COCKPIT_CREATED_AT,
    approvalEventExpiresAt: COCKPIT_APPROVAL_EVENT_EXPIRES_AT,
  });

  const agentCounts = {
    total: agentRegistry.length,
    active: agentRegistry.filter((agent) => agent.status === "active").length,
  };

  return (
    <CockpitShell active="cockpit" crumb="Cockpit">
      <div>
        <h1 className="text-[23px] font-extrabold tracking-tight text-[#eff1fb]">
          Bonjour Michael — voici ce qui compte aujourd&apos;hui.
        </h1>
        <p className="mt-1.5 flex items-center gap-2 text-[13.5px] text-[#98a1c4]">
          <Activity className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
          Signal local depuis le registre des agents. Survole n&apos;importe quel élément pour
          savoir ce qu&apos;il fait — sans cliquer.
        </p>
      </div>

      <CockpitOverview attention={attention} agents={agentCounts} />

      <ControlChain />

      <AgentApprovalPreviewPanel preview={approvalPreview} />

      <CockpitReviewQueue queue={reviewQueue} />

      <VentureSuggestions />
    </CockpitShell>
  );
}
