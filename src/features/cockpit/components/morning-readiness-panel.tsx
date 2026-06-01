import { CheckCircle2, Eye, FileCheck2, Lock, ScrollText, ShieldOff } from "lucide-react";
import type {
  CockpitApprovalPreview,
  CockpitReviewAttention,
} from "@/features/agents/agent-review-cockpit";
import { Card, Eyebrow, Tag } from "./ui";

// ---------------------------------------------------------------------------
// Morning Readiness — read-only executive snapshot for the cockpit.
// It summarizes what is visible today and what remains intentionally blocked.
// ---------------------------------------------------------------------------

interface ReadinessItem {
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "info" | "violet" | "low" | "critical";
  icon: typeof CheckCircle2;
}

function ReadinessCard({ item }: { item: ReadinessItem }) {
  const Icon = item.icon;

  return (
    <article className="rounded-xl border border-white/[0.07] bg-[#1c223a]/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/20 text-violet-200">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <Tag tone={item.tone}>{item.value}</Tag>
      </div>
      <p className="mt-3 text-[13px] font-semibold text-[#eff1fb]">{item.label}</p>
      <p className="mt-1.5 text-xs leading-5 text-[#98a1c4]">{item.detail}</p>
    </article>
  );
}

export function MorningReadinessPanel({
  attention,
  approvalPreview,
}: {
  attention: CockpitReviewAttention;
  approvalPreview: CockpitApprovalPreview;
}) {
  const items: ReadinessItem[] = [
    {
      label: "Governance chain",
      value: "active locally",
      detail: "Autonomy, knowledge packs, scorecards, review queue, packet and event preview render from local deterministic builders.",
      tone: "ok",
      icon: CheckCircle2,
    },
    {
      label: "Review queue",
      value: `${attention.total} visible`,
      detail: `${attention.critical} critical, ${attention.high} high, ${attention.medium} medium, ${attention.low} low items are visible for human review.`,
      tone: attention.needsAttention ? "critical" : "info",
      icon: Eye,
    },
    {
      label: "Approval packet/event",
      value: "preview only",
      detail: `${approvalPreview.totalPreviewed} packet/event previews are shown. They prepare understanding; they do not approve anything.`,
      tone: "violet",
      icon: FileCheck2,
    },
    {
      label: "Ledger persistence",
      value: "designed",
      detail: "DB/RLS persistence is specified in docs, but no table, repository write, or ledger write is implemented here.",
      tone: "low",
      icon: ScrollText,
    },
    {
      label: "Runtime execution",
      value: "blocked",
      detail: "Runtime remains locked until a future approved, ledgered, bounded action exists.",
      tone: "critical",
      icon: Lock,
    },
    {
      label: "Next safe step",
      value: "DB/RLS or UI polish",
      detail: "Proceed with the DB/RLS implementation PR, or keep improving read-only cockpit clarity before any execution work.",
      tone: "info",
      icon: ShieldOff,
    },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Eyebrow>Morning Readiness</Eyebrow>
          <h2 className="mt-1.5 text-[17px] font-bold text-[#eff1fb]">
            Snapshot pour demain matin
          </h2>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#98a1c4]">
            Runtime execution remains blocked. This cockpit does not approve, persist, or execute
            actions.
          </p>
        </div>
        <Tag tone="critical">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          no execution path
        </Tag>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <ReadinessCard key={item.label} item={item} />
        ))}
      </div>
    </Card>
  );
}
