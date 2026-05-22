import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import type { SkillProfile, SkillStatus } from "../types";

const STATUS_STYLES: Record<SkillStatus, { badge: string; dot: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  active: {
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
    label: "Actif",
    Icon: CheckCircle2,
  },
  partial: {
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
    label: "Partiel",
    Icon: AlertCircle,
  },
  planned: {
    badge: "border-neutral-700 bg-neutral-900 text-neutral-500",
    dot: "bg-neutral-600",
    label: "Planifié",
    Icon: Clock,
  },
};

export function SkillCard({ skill }: { skill: SkillProfile }) {
  const status = STATUS_STYLES[skill.status];
  const StatusIcon = status.Icon;

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-white">{skill.label}</h3>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
          {status.label}
        </span>
      </div>

      <p className="text-xs leading-5 text-neutral-400">{skill.description}</p>

      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span>Autonomie {skill.autonomyLevel}/5</span>
        <span>{skill.assignedRoles.join(", ")}</span>
      </div>

      {skill.outputConstraint && (
        <p className="flex items-start gap-1.5 border-t border-neutral-800/60 pt-2 text-xs text-neutral-600">
          <StatusIcon className="mt-0.5 h-3 w-3 shrink-0 text-neutral-700" aria-hidden="true" />
          {skill.outputConstraint}
        </p>
      )}
    </article>
  );
}
