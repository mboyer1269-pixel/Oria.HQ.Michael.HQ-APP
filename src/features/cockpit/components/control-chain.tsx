import { ChevronRight, FileCheck2, Gavel, Lock, ScrollText } from "lucide-react";
import { Card, Eyebrow, Tooltip } from "./ui";

// ---------------------------------------------------------------------------
// Control chain — the always-visible spine of the cockpit.
//
// Shows that nothing executes without passing every gate:
//   Approval Packet → Approval Event → Ledger Entry → Runtime Execution
//
// State is honest: the packet and event contracts exist today (pure/local);
// the ledger write and runtime execution are future and remain LOCKED. This
// component is presentational — it reflects the current governance posture,
// it does not perform any action.
// ---------------------------------------------------------------------------

type StageState = "ready" | "future" | "locked";

interface Stage {
  key: string;
  label: string;
  icon: typeof FileCheck2;
  state: StageState;
  detail: string;
  meta: string;
}

const STAGES: Stage[] = [
  {
    key: "packet",
    label: "Approval Packet",
    icon: FileCheck2,
    state: "ready",
    detail: "Prépare une décision humaine. N'approuve rien, n'exécute rien.",
    meta: "Contrat en place",
  },
  {
    key: "event",
    label: "Approval Event",
    icon: Gavel,
    state: "ready",
    detail: "Décision humaine explicite. Même approuvée, n'autorise pas l'exécution.",
    meta: "Contrat en place",
  },
  {
    key: "ledger",
    label: "Ledger Entry",
    icon: ScrollText,
    state: "future",
    detail: "Enregistrement immuable et auditable. Pré-condition obligatoire avant toute exécution.",
    meta: "À venir",
  },
  {
    key: "runtime",
    label: "Runtime Execution",
    icon: Lock,
    state: "locked",
    detail: "Exécution bornée et réversible. Verrouillée tant qu'une action n'est pas approuvée et ledgerée.",
    meta: "Verrouillé",
  },
];

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
};

export function ControlChain() {
  return (
    <Card>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Eyebrow>Chaîne de contrôle</Eyebrow>
          <h3 className="mt-1.5 text-[15px] font-bold text-[#eff1fb]">
            Rien ne s&apos;exécute sans franchir chaque garde-fou
          </h3>
        </div>
        <Tooltip
          title="Pourquoi c'est là"
          detail="C'est la garantie d'Oria : chaque action conséquente est barrée, tracée et réversible. Une approbation n'est pas une exécution."
          align="right"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[#98a1c4]">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            Runtime verrouillé
          </span>
        </Tooltip>
      </div>

      <div className="mt-4 flex flex-wrap items-stretch gap-2">
        {STAGES.map((stage, index) => {
          const style = STATE_STYLE[stage.state];
          const Icon = stage.icon;
          return (
            <div key={stage.key} className="flex flex-1 items-center gap-2">
              <Tooltip
                title={stage.label}
                detail={stage.detail}
                meta={<span className="font-semibold text-[#98a1c4]">{stage.meta}</span>}
                align={index === 0 ? "left" : index === STAGES.length - 1 ? "right" : "center"}
                className="min-w-0 flex-1"
              >
                <div
                  className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2.5 ${style.ring}`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/20 ${style.icon}`}>
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
              {index < STAGES.length - 1 ? (
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-[#646c8e] sm:block" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
