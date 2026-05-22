import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { AgentSkillMappingResult } from "../skill-mapping";

const STATUS_BADGE: Record<string, string> = {
  active: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  partial: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  planned: "border-neutral-700 bg-neutral-900 text-neutral-500",
};

export function AgentSkillPanel({ result }: { result: AgentSkillMappingResult }) {
  const { agent, matched, missing } = result;
  const hasMissing = missing.length > 0;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex items-center gap-2">
        {hasMissing ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
        )}
        <span className="font-medium text-white">{agent.name}</span>
        <span className="text-xs text-neutral-500">·  {agent.role}</span>
      </div>

      {matched.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {matched.map((skill) => (
            <li
              key={skill.id}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[skill.status] ?? STATUS_BADGE.planned}`}
            >
              {skill.label}
            </li>
          ))}
        </ul>
      )}

      {hasMissing && (
        <ul className="mt-2 space-y-1">
          {missing.map((id) => (
            <li key={id} className="flex items-center gap-1.5 text-xs text-red-400/70">
              <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
              <code className="font-mono">{id}</code>
              <span className="text-neutral-600">— absent du catalogue</span>
            </li>
          ))}
        </ul>
      )}

      {matched.length === 0 && !hasMissing && (
        <p className="mt-2 text-xs text-neutral-600">Aucune skill déclarée.</p>
      )}
    </div>
  );
}
