import { FileCheck2, Gavel, Lock, ScrollText, ShieldOff } from "lucide-react";
import type { CockpitApprovalPreview } from "@/features/agents/agent-review-cockpit";
import { Card, Eyebrow, Tag } from "./ui";

// ---------------------------------------------------------------------------
// Agent approval preview — read-only visualization of the governance chain.
// No approval, ledger write, autonomy change, or runtime execution happens here.
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#646c8e]">{label}</p>
      <p className="mt-1 truncate font-mono text-[11.5px] text-[#eff1fb]" title={value}>
        {value}
      </p>
    </div>
  );
}

function BooleanPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1 font-mono text-[10.5px] font-semibold text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      {label}: true
    </span>
  );
}

export function AgentApprovalPreviewPanel({ preview }: { preview: CockpitApprovalPreview }) {
  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Eyebrow>Approval chain · preview</Eyebrow>
          <h2 className="mt-1.5 flex items-center gap-2 text-[17px] font-bold text-[#eff1fb]">
            <FileCheck2 className="h-4 w-4 text-violet-300" aria-hidden="true" />
            Packet et event d&apos;approbation
          </h2>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#98a1c4]">
            Read-only preview. No approval, ledger write, autonomy change, or runtime execution is
            performed from this view.
          </p>
          <p className="mt-1 max-w-3xl text-[13px] leading-6 text-[#98a1c4]">
            Even a human-approved event does not authorize runtime execution until a future ledgered
            action exists.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Tag tone="violet">
            <Gavel className="h-3.5 w-3.5" aria-hidden="true" />
            {preview.totalPreviewed} preview
          </Tag>
          <Tag tone="critical">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            runtime blocked
          </Tag>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#646c8e]" aria-hidden="true" />
        <p className="text-xs leading-5 text-[#646c8e]">
          <span className="font-semibold text-[#98a1c4]">Audit-only chain.</span> Le packet
          prépare une décision; l&apos;event illustre la décision humaine; le ledger futur reste
          requis; le runtime reste verrouillé.
        </p>
      </div>

      <div className="mt-5 grid gap-3">
        {preview.items.map(({ queueItem, packet, approvalEventPreview, runtimeBlocked }) => (
          <article
            key={packet.packetId}
            className="rounded-xl border border-white/[0.07] bg-[#1c223a]/55 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone="info">
                    <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Review Queue Item
                  </Tag>
                  <span className="text-[#646c8e]">→</span>
                  <Tag tone="violet">Approval Packet Draft</Tag>
                  <span className="text-[#646c8e]">→</span>
                  <Tag tone="medium">Human Decision Preview</Tag>
                  <span className="text-[#646c8e]">→</span>
                  <Tag tone="low">
                    <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                    Future Ledger Required
                  </Tag>
                  <span className="text-[#646c8e]">→</span>
                  <Tag tone="critical">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    Runtime Still Blocked
                  </Tag>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#98a1c4]">{queueItem.executiveSummary}</p>
              </div>
              <Tag tone={runtimeBlocked ? "critical" : "ok"}>runtimeBlocked: true</Tag>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="packetId" value={packet.packetId} />
              <Field label="queueItemId" value={packet.queueItemId} />
              <Field label="agentId" value={packet.agentId} />
              <Field label="outcomeId" value={packet.outcomeId} />
              <Field label="requestedDecision" value={packet.requestedDecision} />
              <Field label="sourceNextAction" value={packet.sourceNextAction} />
              <Field label="riskSummary" value={`${packet.riskSummary.level} · ${packet.riskSummary.riskFlagCount} flags`} />
              <Field label="requiredReview" value={packet.requiredReview.requiredReview} />
              <Field label="eventStatus" value={approvalEventPreview.status} />
              <Field label="approvalEventId" value={approvalEventPreview.approvalEventId} />
              <Field label="decision" value={approvalEventPreview.decision} />
              <Field label="expiresAt" value={approvalEventPreview.expiresAt ?? "none"} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <BooleanPill label="approvalRequired" />
              <BooleanPill label="ledgerRequiredBeforeExecution" />
              <BooleanPill label="noRuntimeExecutionAuthorized" />
              <BooleanPill label="noAutoApproval" />
              <BooleanPill label="approvalEventOnly" />
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}
