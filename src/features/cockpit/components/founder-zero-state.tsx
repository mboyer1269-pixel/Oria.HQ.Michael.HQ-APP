import { CalendarDays, Database, Lightbulb, Lock, Rows3, ShieldCheck } from "lucide-react";
import { IdeaIntakeForm } from "@/features/cockpit/components/idea-intake-form";
import { JorisPresence } from "@/features/cockpit/components/joris-presence";
import { DailyDirectionWidget } from "@/features/cockpit/components/daily-direction-widget";
import type { IdeaProjection } from "@/features/cockpit/events/idea-projection";
import type { EventPersistenceMode } from "@/features/cockpit/events/event-client";
import type { DailyDirectionProjection } from "@/features/cockpit/events/daily-direction-projection";
import { parseWidgetManifest, type WidgetManifest } from "@/features/cockpit/widgets/widget-manifest";

// Remaining stubs — daily-direction is now a real widget (PR-2).
const comingSoonWidgets: WidgetManifest[] = [
  {
    id: "revenue-proof",
    title: "Revenue Proof",
    description: "Preuve de revenu reliée à des signaux vérifiés.",
    renderKind: "stub_card",
    dataTruth: "stub",
    source: {
      kind: "stub",
      eventTypes: [],
      description: "Aucune preuve de revenu connectée en PR-2.",
    },
    lifecycleStatus: "coming_soon",
    createdBy: "system",
    constraints: {
      noGeneratedCode: true,
      noRuntimeExecution: true,
      noJorisWidgetCreation: true,
      allowedEventTypes: [],
    },
    layout: { region: "stubs", order: 0, minColumnSpan: 1 },
  },
  {
    id: "ledger-pulse",
    title: "Ledger Pulse",
    description: "Lecture de santé du ledger et des décisions.",
    renderKind: "stub_card",
    dataTruth: "stub",
    source: {
      kind: "stub",
      eventTypes: [],
      description: "Aucun signal ledger réel connecté à cette carte en PR-2.",
    },
    lifecycleStatus: "coming_soon",
    createdBy: "system",
    constraints: {
      noGeneratedCode: true,
      noRuntimeExecution: true,
      noJorisWidgetCreation: true,
      allowedEventTypes: [],
    },
    layout: { region: "stubs", order: 1, minColumnSpan: 1 },
  },
  {
    id: "missions",
    title: "Missions",
    description: "Missions approuvées et ledger d'actions.",
    renderKind: "stub_card",
    dataTruth: "stub",
    source: {
      kind: "stub",
      eventTypes: [],
      description: "PR-4 — hors scope PR-2.",
    },
    lifecycleStatus: "coming_soon",
    createdBy: "system",
    constraints: {
      noGeneratedCode: true,
      noRuntimeExecution: true,
      noJorisWidgetCreation: true,
      allowedEventTypes: [],
    },
    layout: { region: "stubs", order: 2, minColumnSpan: 1 },
  },
].map(parseWidgetManifest);

const dateFormatter = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatter.format(date);
}

function storageLabel(mode: EventPersistenceMode) {
  if (mode === "supabase") return "Supabase";
  if (mode === "local") return "local dev";
  return "indisponible";
}

function StubCard({ widget }: { widget: WidgetManifest }) {
  return (
    <article className="rounded-lg border border-white/[0.07] bg-[#111827]/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#eff1fb]">{widget.title}</p>
          <p className="mt-1 text-xs leading-5 text-[#8791b7]">{widget.description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-2.5 py-1 text-[10.5px] font-bold text-amber-200">
          À venir
        </span>
      </div>
      <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11.5px] leading-5 text-[#6f7899]">
        Aucune donnée réelle encore connectée.
      </p>
    </article>
  );
}

function DecisionQueue({
  ideas,
  loadError,
}: {
  ideas: IdeaProjection[];
  loadError: boolean;
}) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-[#111827]/55 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">
            <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />
            Decision Queue
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-[#eff1fb]">Idées capturées</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-[#8791b7]">
          {ideas.length} event{ideas.length > 1 ? "s" : ""}
        </span>
      </div>

      {loadError ? (
        <p className="mt-4 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-3 py-2 text-xs leading-5 text-rose-100">
          Lecture events impossible. La file ne tombe pas en mock.
        </p>
      ) : null}

      {!loadError && ideas.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-white/12 bg-black/20 p-5 text-sm leading-6 text-[#8791b7]">
          Aucune idée capturée pour l&apos;instant. La file restera vide tant qu&apos;aucun event
          <span className="font-semibold text-[#b8c0df]"> idea.captured</span> n&apos;existe.
        </div>
      ) : null}

      {ideas.length > 0 ? (
        <ol className="mt-5 flex flex-col gap-3">
          {ideas.map((idea) => (
            <li key={idea.eventId} className="rounded-lg border border-white/[0.07] bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#eff1fb]">{idea.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-6 text-[#aab3d1]">
                    {idea.rawText}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] px-2.5 py-1 text-[10.5px] font-bold text-emerald-200">
                  event réel
                </span>
              </div>
              <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] text-[#6f7899]">
                Capturée le {formatDate(idea.capturedAt)} · event {idea.eventId}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export function FounderZeroStateCockpit({
  ideas,
  loadError,
  storageMode,
  todayDirection,
  todayIso,
}: {
  ideas: IdeaProjection[];
  loadError: boolean;
  storageMode: EventPersistenceMode;
  todayDirection: DailyDirectionProjection | null;
  todayIso: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Header + Joris Presence */}
      <section className="grid gap-5 border-b border-white/[0.06] pb-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Founder Operator Zero-State
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight text-[#eff1fb] md:text-4xl">
            Aucune venture active.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#aab3d1]">
            Michael HQ démarre de zéro. Capture une idée ou enregistre une décision; les ventures
            seront promues seulement après validation réelle.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-3 py-1 text-xs font-semibold text-amber-200">
              clarifier → capturer → décider → tracer → relire
            </span>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-1 text-xs font-semibold text-emerald-200">
              Source events: {storageLabel(storageMode)}
            </span>
          </div>

          {/* Joris Presence — état opérationnel réel */}
          <div className="mt-5 max-w-sm">
            <JorisPresence
              ideas={ideas}
              todayDirection={todayDirection}
              loadError={loadError}
              todayIso={todayIso}
            />
          </div>
        </div>

        <aside className="rounded-lg border border-white/[0.07] bg-[#111827]/55 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-[#eff1fb]">
            <Database className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            Vérité métier
          </p>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-[#8791b7]">
            <li className="flex gap-2">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200" aria-hidden="true" />
              Events append-only.
            </li>
            <li className="flex gap-2">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200" aria-hidden="true" />
              Decision Queue dérivée de idea.captured.
            </li>
            <li className="flex gap-2">
              <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200" aria-hidden="true" />
              Daily Direction dérivée des events réels.
            </li>
          </ul>
        </aside>
      </section>

      {/* Daily Direction Widget — plan du jour Joris */}
      <DailyDirectionWidget initialDirection={todayDirection} />

      {/* Idea Intake + Decision Queue */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-lg border border-white/[0.07] bg-[#111827]/55 p-5">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">
            <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
            Idea Intake
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-[#eff1fb]">Capturer une idée</h2>
          <p className="mt-2 text-sm leading-6 text-[#8791b7]">
            Le formulaire écrit un event <span className="font-semibold text-[#b8c0df]">idea.captured</span>.
            La projection ne s&apos;alimente que depuis cette table.
          </p>
          <div className="mt-5">
            <IdeaIntakeForm />
          </div>
        </section>

        <DecisionQueue ideas={ideas} loadError={loadError} />
      </div>

      {/* Remaining stubs */}
      <section className="border-t border-white/[0.06] pt-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6f7899]">
              Modules à venir
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-[#eff1fb]">Stubs honnêtes</h2>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {comingSoonWidgets.map((widget) => (
            <StubCard key={widget.id} widget={widget} />
          ))}
        </div>
      </section>
    </div>
  );
}
