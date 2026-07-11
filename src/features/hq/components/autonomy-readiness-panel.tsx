import { HQ_CAPABILITIES, capabilityStatusLabel, type CapabilityRecord } from "@/features/hq/capability-status";

const STATUS_STYLE: Record<CapabilityRecord["status"], string> = {
  live: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  display_only: "border-amber-500/25 bg-amber-500/10 text-amber-100",
  shadow: "border-violet-500/25 bg-violet-500/10 text-violet-100",
  contract_only: "border-sky-500/25 bg-sky-500/10 text-sky-100",
  planned: "border-neutral-700 bg-neutral-900/70 text-neutral-400",
};

const AUTONOMY_FOCUS_IDS = [
  "subscription_cli_probe",
  "subscription_cli_dispatch",
  "nous_hermes_agent_adapter",
  "marketplace_tool_corridor",
  "studio_marketing_autonomy",
  "cost_ladder",
  "mission_execution_boundary",
] as const;

/**
 * Honest autonomy readiness board — surfaces capability-status truth only.
 * Never invents live marketplace OAuth or subscription dispatch.
 */
export function AutonomyReadinessPanel() {
  const focused = AUTONOMY_FOCUS_IDS.map((id) => HQ_CAPABILITIES.find((c) => c.id === id)).filter(
    (c): c is CapabilityRecord => Boolean(c),
  );

  return (
    <section
      data-testid="autonomy-readiness-panel"
      className="rounded-3xl border border-neutral-800 bg-neutral-950/85 p-4 md:p-6"
    >
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">Autonomy</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Readiness — vérité produit</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-400">
          Carte vers un cockpit autonome façon Viktor (outils + review-first) et une intégration Hermes
          Agent / Studio Marketplace — sans prétendre que c&apos;est déjà live. Source :{" "}
          <code className="text-neutral-500">docs/AUTONOMY_COCKPIT_BRIEF.md</code>.
        </p>
      </div>

      <ul className="space-y-3">
        {focused.map((capability) => (
          <li
            key={capability.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[capability.status]}`}
              >
                {capabilityStatusLabel(capability.status)}
              </span>
              <p className="font-medium text-white">{capability.label}</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-neutral-400">{capability.note}</p>
            <p className="mt-2 text-[11px] text-neutral-600">
              Evidence: {capability.evidence}
              {capability.surface ? ` · Surface: ${capability.surface}` : null}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-4 text-sm leading-6 text-neutral-500">
        <p className="font-medium text-neutral-300">Yellow 1–3 livrés (bornés)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            CLI dry-run — <code className="text-neutral-400">POST /api/runtimes/local/dry-run</code>{" "}
            (pas de subprocess)
          </li>
          <li>
            Marketplace browse —{" "}
            <code className="text-neutral-400">GET /api/marketplace/catalog</code> + MCP{" "}
            <code className="text-neutral-400">marketplace_catalog_browse</code>
          </li>
          <li>
            Studio heartbeat — <code className="text-neutral-400">POST /api/studio/prep-tick</code>{" "}
            (prepare-only)
          </li>
        </ol>
        <p className="mt-3 text-neutral-600">
          Suivant (mandat explicite) : subprocess CLI réel, OAuth marketplace live, publish Studio.
        </p>
      </div>
    </section>
  );
}
