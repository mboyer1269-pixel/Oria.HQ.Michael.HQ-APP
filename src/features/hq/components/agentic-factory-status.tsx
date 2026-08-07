import { CheckCircle2, LockKeyhole, ShieldAlert, Sparkles, Zap } from "lucide-react";
import {
  deriveRuntimePosture,
  RUNTIME_CAPABILITIES,
  type RuntimeCapability,
} from "@/core/runtime-capability-inventory";

// Agentic Factory Status — what this runtime can actually do.
//
// Two of these cards used to be written by hand: "In-process mock execution
// only" and "VPS execution and writes suspended". Both were false. The green
// lane runs a real handler that calls a model API over the network, and the
// ledger has had writers for months. Nothing failed, because nothing was
// reading the code — the copy was a memory of an older system.
//
// The execution cards now come from the central capability inventory, so they
// change when the executors change. The two remaining hand-written cards say
// only things a reader can check on this page.

const EFFECT_LABEL: Record<RuntimeCapability["effect"], string> = {
  none: "aucun effet",
  internal_write: "écriture interne",
  external_call: "appel externe",
};

const GATE_LABEL: Record<RuntimeCapability["gate"], string> = {
  ceo_approval: "approbation CEO",
  sentinelle_green_lane: "Sentinelle · zone verte",
  scheduled_pass: "passe planifiée",
};

export function AgenticFactoryStatus() {
  const posture = deriveRuntimePosture(RUNTIME_CAPABILITIES);

  const postureBadge =
    posture.state === "bounded"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";

  const statusItems = [
    {
      label: "Factory configured",
      description: "Delivery loop logic in place",
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
      badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
      state: "Active",
    },
    {
      label: "Skills available",
      description: "Agents equipped with specialized SKILL.md",
      icon: <Sparkles className="h-5 w-5 text-amber-400" />,
      badge: "border-amber-500/20 bg-amber-500/10 text-amber-300",
      state: "Active",
    },
    {
      label: "Human approval required",
      description: `${posture.effectful.length - posture.ungatedEffects.length}/${posture.effectful.length} exécuteur(s) à effet derrière une approbation CEO`,
      icon: <ShieldAlert className="h-5 w-5 text-violet-400" />,
      badge: "border-violet-500/20 bg-violet-500/10 text-violet-300",
      state: "Active",
    },
    {
      label: "Runtime posture",
      description: posture.detail,
      icon: <LockKeyhole className="h-5 w-5 text-blue-400" />,
      badge: postureBadge,
      state: posture.meta,
    },
    {
      label: "Executors inventoried",
      description: `${RUNTIME_CAPABILITIES.length} exécuteur(s) déclaré(s), dont ${posture.effectful.length} à effet réel`,
      icon: <Zap className="h-5 w-5 text-sky-400" />,
      badge: "border-sky-500/20 bg-sky-500/10 text-sky-300",
      state: "Inventorié",
    },
  ];

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Antigravity</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Agentic Factory Status</h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-500/20 bg-neutral-500/10 px-3 py-1 text-xs text-neutral-300">
          Dérivé de l&apos;inventaire des capacités
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statusItems.map((item) => (
          <article key={item.label} className="flex flex-col justify-between rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800/50">
                {item.icon}
              </div>
              <h3 className="font-semibold text-white">{item.label}</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-400">{item.description}</p>
            </div>
            <div className={`mt-4 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium ${item.badge}`}>
              {item.state}
            </div>
          </article>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {RUNTIME_CAPABILITIES.map((capability) => (
          <li
            key={capability.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">{capability.label}</p>
              <span className="text-[11px] text-neutral-400">
                {EFFECT_LABEL[capability.effect]} · {GATE_LABEL[capability.gate]}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-neutral-500">{capability.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
