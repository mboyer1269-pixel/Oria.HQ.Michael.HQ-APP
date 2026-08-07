import { ChevronRight, FileCheck2, Gavel, Lock, ScrollText, ShieldCheck } from "lucide-react";
import { Card, Eyebrow, Tooltip } from "./ui";
import {
  CONTROL_LANES,
  RUNTIME_STAGE_KEY,
  type ControlChainStage,
  type ControlLane,
  type StageState,
} from "@/features/cockpit/control-chain-posture";

// ---------------------------------------------------------------------------
// Control chain — the always-visible spine of the cockpit.
//
// Renders both lanes that reach execution: the approval rail, and the green
// lane that executes after a Sentinelle verdict with no approval packet. Each
// lane states only what it guarantees.
//
// Presentational only: it performs no action and decides nothing. States live
// in control-chain-posture.ts, tied to the evidence justifying them, so the
// screen and the guarantee cannot diverge.
// ---------------------------------------------------------------------------

const ICONS: Record<string, typeof FileCheck2> = {
  packet: FileCheck2,
  event: Gavel,
  sentinelle: ShieldCheck,
  own_gate: ShieldCheck,
  ledger: ScrollText,
  [RUNTIME_STAGE_KEY]: Lock,
};

const STATE_STYLE: Record<StageState, { ring: string; icon: string; dot: string }> = {
  ready: {
    ring: "border-violet-500/40 bg-violet-500/10",
    icon: "text-violet-200",
    dot: "bg-violet-400",
  },
  future: {
    ring: "border-white/10 bg-white/[0.03]",
    icon: "text-[#646c8e]",
    dot: "bg-[#646c8e]",
  },
  locked: {
    ring: "border-rose-500/30 bg-rose-500/[0.06]",
    icon: "text-rose-300",
    dot: "bg-rose-400",
  },
  gated: {
    ring: "border-rose-500/30 bg-rose-500/[0.06]",
    icon: "text-rose-300",
    dot: "bg-rose-400",
  },
  // Distinct from locked and gated: an effect can occur on this lane without
  // traversing the approval rail.
  bounded: {
    ring: "border-amber-500/30 bg-amber-500/[0.06]",
    icon: "text-amber-300",
    dot: "bg-amber-400",
  },
};

function LaneStages({ stages }: { stages: readonly ControlChainStage[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-stretch gap-2">
      {stages.map((stage, index) => {
        const style = STATE_STYLE[stage.state];
        const Icon = ICONS[stage.key] ?? FileCheck2;
        return (
          <div key={`${stage.key}-${index}`} className="flex flex-1 items-center gap-2">
            <Tooltip
              title={stage.label}
              detail={stage.detail}
              meta={<span className="font-semibold text-[#98a1c4]">{stage.meta}</span>}
              align={index === 0 ? "left" : index === stages.length - 1 ? "right" : "center"}
              className="min-w-0 flex-1"
            >
              <div
                className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2.5 ${style.ring}`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/20 ${style.icon}`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-[#eff1fb]">
                    {stage.label}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10.5px] text-[#646c8e]">
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {stage.meta}
                  </span>
                </span>
              </div>
            </Tooltip>
            {index < stages.length - 1 ? (
              <ChevronRight
                className="hidden h-4 w-4 shrink-0 text-[#646c8e] sm:block"
                aria-hidden="true"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Lane({ lane }: { lane: ControlLane }) {
  // No fallback: a substitute stage would put a confident, wrong claim in the
  // pill. Absent means absent, and the pill is omitted.
  const runtimeStage = lane.stages.find((stage) => stage.key === RUNTIME_STAGE_KEY);

  return (
    <section className="mt-4 first:mt-0">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Eyebrow>{lane.label}</Eyebrow>
          <h4 className="mt-1 text-[13.5px] font-bold text-[#eff1fb]">{lane.headline}</h4>
        </div>
        {runtimeStage ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[#98a1c4]">
            <span className={`h-1.5 w-1.5 rounded-full ${STATE_STYLE[runtimeStage.state].dot}`} />
            {runtimeStage.label} · {runtimeStage.meta}
          </span>
        ) : null}
      </div>
      <LaneStages stages={lane.stages} />
      <p className="mt-2 text-[10.5px] text-[#646c8e]">
        {lane.capabilityIds.length === 0
          ? "Aucun exécuteur n'emprunte cette voie."
          : `Exécuteurs sur cette voie : ${lane.capabilityIds.join(", ")}`}
      </p>
    </section>
  );
}

export function ControlChain() {
  return (
    <Card>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Eyebrow>Chaîne de contrôle</Eyebrow>
          <h3 className="mt-1.5 text-[15px] font-bold text-[#eff1fb]">
            Deux voies mènent à l&apos;exécution, avec des garanties différentes
          </h3>
        </div>
        <Tooltip
          title="Pourquoi c'est là"
          detail="Une approbation n'est pas une exécution, et toute exécution ne passe pas par une approbation. Chaque voie affiche ce qu'elle garantit et ce qu'elle ne garantit pas."
          align="right"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[#98a1c4]">
            {CONTROL_LANES.length} voies
          </span>
        </Tooltip>
      </div>

      {CONTROL_LANES.map((lane) => (
        <Lane key={lane.key} lane={lane} />
      ))}
    </Card>
  );
}
