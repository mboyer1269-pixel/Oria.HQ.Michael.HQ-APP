"use client";

// src/features/cockpit/components/daily-direction-widget.tsx
//
// Daily Direction Widget — affiche le plan du jour de Joris.
//
// Comportement :
//   - Reçoit initialDirection depuis SSR (nul si pas encore généré aujourd'hui).
//   - Si null → appelle la Server Action au montage pour générer.
//   - Affiche un spinner pendant la génération.
//   - Une fois disponible, affiche les 7 éléments du plan avec traçabilité.
//   - N'affiche jamais un objet non validé (la validation est faite côté serveur).
//   - En zero-state, Joris dit honnêtement quoi faire — pas de fiction.

import { useEffect, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowRight,
  DollarSign,
  Hammer,
  HelpCircle,
  Loader2,
  Scissors,
  Target,
  Zap,
} from "lucide-react";
import { generateDailyDirectionAction } from "@/features/cockpit/events/generate-daily-direction-action";
import type { DailyDirectionProjection } from "@/features/cockpit/events/daily-direction-projection";
import type { DailyDirectionItem } from "@/features/cockpit/events/event-record";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SourceBadge({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <span className="mt-1.5 block text-[10.5px] text-[#6f7899]">
      source:{" "}
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 ? ", " : ""}
          <span className="font-mono text-[10px] text-[#8791b7]">{id.slice(0, 8)}</span>
        </span>
      ))}
    </span>
  );
}

function DirectionItem({
  icon: Icon,
  iconColor,
  label,
  item,
}: {
  icon: typeof Target;
  iconColor: string;
  label: string;
  item: DailyDirectionItem;
}) {
  return (
    <div className="flex gap-3">
      <span
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-black/30 ${iconColor}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#6f7899]">
          {label}
        </p>
        <p className="mt-0.5 text-[13px] leading-6 text-[#c4cde8]">{item.text}</p>
        <SourceBadge ids={item.sourceEventIds} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function GeneratingState() {
  return (
    <div className="flex items-center gap-3 py-6 text-[#8791b7]">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" aria-hidden="true" />
      <span className="text-sm">Joris lit tes events et prépare le plan du jour…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.07] p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-rose-200">Joris ne répond pas</p>
          <p className="mt-1 text-xs leading-5 text-rose-200/70">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 text-xs font-semibold text-rose-300 underline underline-offset-2 hover:text-rose-200"
          >
            Réessayer
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Direction display
// ---------------------------------------------------------------------------

function DirectionDisplay({ projection }: { projection: DailyDirectionProjection }) {
  const { payload } = projection;

  return (
    <div className="flex flex-col gap-5">
      {/* Zero-state message */}
      {payload.isZeroState && payload.zeroStateMessage ? (
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
          <p className="text-[12.5px] leading-6 text-amber-200">
            <span className="font-bold">Joris : </span>
            {payload.zeroStateMessage}
          </p>
        </div>
      ) : null}

      {/* Outcomes */}
      <section>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#6f7899]">
          3 outcomes du jour
        </p>
        <ol className="flex flex-col gap-4">
          {payload.outcomes.map((outcome, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-[10px] font-bold text-violet-300">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] leading-6 text-[#c4cde8]">{outcome.text}</p>
                <SourceBadge ids={outcome.sourceEventIds} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <hr className="border-white/[0.06]" />

      {/* Single-item cards */}
      <section className="grid gap-4 sm:grid-cols-2">
        <DirectionItem
          icon={DollarSign}
          iconColor="text-emerald-300"
          label="Action cash"
          item={payload.cashAction}
        />
        <DirectionItem
          icon={Hammer}
          iconColor="text-cyan-300"
          label="Action build"
          item={payload.buildAction}
        />
        <DirectionItem
          icon={HelpCircle}
          iconColor="text-amber-300"
          label="Décision à prendre"
          item={payload.decisionToMake}
        />
        <DirectionItem
          icon={Scissors}
          iconColor="text-rose-300"
          label="Couper / ignorer"
          item={payload.thingToCut}
        />
      </section>

      {/* Metadata footer */}
      <p className="border-t border-white/[0.06] pt-3 text-[10.5px] text-[#505878]">
        Direction {payload.dateIso} · event {projection.eventId.slice(0, 8)} ·{" "}
        {payload.generatorEventIds.length} event
        {payload.generatorEventIds.length !== 1 ? "s" : ""} source
        {payload.isZeroState ? " · zero-state honnête" : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type WidgetState =
  | { phase: "ready"; projection: DailyDirectionProjection }
  | { phase: "generating" }
  | { phase: "error"; message: string };

export function DailyDirectionWidget({
  initialDirection,
}: {
  initialDirection: DailyDirectionProjection | null;
}) {
  const [widgetState, setWidgetState] = useState<WidgetState>(
    initialDirection ? { phase: "ready", projection: initialDirection } : { phase: "generating" },
  );
  const [isPending, startTransition] = useTransition();
  const hasAutoTriggered = useRef(false);

  async function runGeneration() {
    setWidgetState({ phase: "generating" });
    startTransition(async () => {
      const result = await generateDailyDirectionAction();
      if (result.status === "success") {
        setWidgetState({ phase: "ready", projection: result.projection });
      } else if (result.status === "forbidden") {
        setWidgetState({ phase: "error", message: "Accès réservé au propriétaire." });
      } else {
        setWidgetState({
          phase: "error",
          message: result.status === "error" ? result.message : "Erreur inconnue.",
        });
      }
    });
  }

  // Auto-trigger generation on mount if no direction exists.
  useEffect(() => {
    if (!initialDirection && !hasAutoTriggered.current) {
      hasAutoTriggered.current = true;
      void runGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-lg border border-white/[0.07] bg-[#111827]/55 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300">
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            Daily Direction
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-[#eff1fb]">Plan du jour — Joris</h2>
        </div>

        {widgetState.phase === "ready" ? (
          <button
            type="button"
            onClick={runGeneration}
            disabled={isPending}
            aria-label="Régénérer la direction du jour"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[11.5px] font-semibold text-[#8791b7] transition hover:border-violet-500/30 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            Régénérer
          </button>
        ) : null}
      </div>

      {widgetState.phase === "generating" && <GeneratingState />}

      {widgetState.phase === "error" && (
        <ErrorState message={widgetState.message} onRetry={runGeneration} />
      )}

      {widgetState.phase === "ready" && (
        <DirectionDisplay projection={widgetState.projection} />
      )}
    </section>
  );
}
