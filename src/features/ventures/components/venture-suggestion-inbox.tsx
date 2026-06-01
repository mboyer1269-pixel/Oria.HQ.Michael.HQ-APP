import { BadgeAlert, CheckCircle2, CheckSquare2, Save, Search, Sparkles } from "lucide-react";
import {
  getVisibleSuggestionLimit,
  summarizeSuggestionInbox,
  type VentureCandidateSuggestion,
} from "../venture-suggestions";
import type { SaveVentureSuggestionInput } from "../venture-save-types";

const NEXT_ACTION_LABELS: Record<VentureCandidateSuggestion["suggestedNextAction"], string> = {
  review: "À reviewer",
  score: "À scorer",
  reject: "À rejeter",
  save_later: "À garder plus tard",
};

const SOURCE_LABELS: Record<VentureCandidateSuggestion["source"], string> = {
  simulated: "Simulation",
  future_agent: "Future agent",
};

const ACTION_TONE_CLASS: Record<VentureCandidateSuggestion["suggestedNextAction"], string> = {
  review: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
  score: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  reject: "border-red-500/20 bg-red-500/10 text-red-300",
  save_later: "border-neutral-700 bg-neutral-900 text-neutral-300",
};

function formatCurrency(cents?: number): string {
  if (!cents || cents <= 0) {
    return "0 € — aucune dépense pré-autorisée";
  }

  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

function formatEstimatedScoreLabel(suggestion: VentureCandidateSuggestion): string {
  if (!suggestion.estimatedScore) {
    return "Score estimé : à calculer";
  }

  return `Score estimé : ${suggestion.estimatedScore.overallScore}/100 · ${suggestion.estimatedScore.recommendation}`;
}

export function VentureSuggestionInbox({
  suggestions,
  savedSuggestionIds = [],
  pending = false,
  onSaveSuggestion,
}: {
  suggestions: VentureCandidateSuggestion[];
  savedSuggestionIds?: string[];
  pending?: boolean;
  onSaveSuggestion?: (input: SaveVentureSuggestionInput) => void;
}) {
  const summary = summarizeSuggestionInbox(suggestions);
  const displaySuggestions = summary.rankedSuggestions;
  const visibleLimit = getVisibleSuggestionLimit();
  const savedSuggestionIdSet = new Set(savedSuggestionIds);
  const canSaveSuggestions = typeof onSaveSuggestion === "function";

  return (
    <section
      aria-label="Boîte de suggestions"
      className="rounded-3xl border border-cyan-500/20 bg-neutral-950/55 p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
            Boîte de suggestions
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Suggestions candidates pour revue CEO
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Simulation contrôlée — aucune venture créée sans décision CEO explicite. Cette boîte
            prépare l&apos;accueil de futures suggestions agent sans génération live.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-200">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Contrôle CEO
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Suggestions totales
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
            {summary.totalCount}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Limite visible
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{visibleLimit}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Source
          </p>
          <p className="mt-2 text-sm text-neutral-300">
            <span className="font-semibold text-white">{summary.simulatedCount}</span> simulation
            {summary.simulatedCount !== 1 ? "s" : ""} ·{" "}
            <span className="font-semibold text-white">{summary.futureAgentCount}</span> future
            agent{summary.futureAgentCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Score moyen
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
            {summary.averageEstimatedScore ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["review", summary.byNextAction.review],
            ["score", summary.byNextAction.score],
            ["reject", summary.byNextAction.reject],
            ["save_later", summary.byNextAction.save_later],
          ] as const
        ).map(([key, count]) => (
          <span
            key={key}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${ACTION_TONE_CLASS[key]}`}
          >
            <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">
              {NEXT_ACTION_LABELS[key]}
            </span>
            <span className="tabular-nums text-white">{count}</span>
          </span>
        ))}
      </div>

      {displaySuggestions.length > 0 ? (
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {displaySuggestions.map((suggestion, index) => {
            const isSaved = savedSuggestionIdSet.has(suggestion.id);
            return (
              <article
                key={suggestion.id}
                className={`rounded-2xl border p-4 ${
                  index === 0
                    ? "border-cyan-500/30 bg-cyan-500/10"
                    : "border-neutral-800 bg-neutral-900/60"
                }`}
              >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
                    <Search className="h-3.5 w-3.5" aria-hidden="true" />
                    #{index + 1}
                  </span>
                  <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-neutral-200">
                    {suggestion.name}
                  </span>
                  <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-[11px] font-medium text-neutral-400">
                    {SOURCE_LABELS[suggestion.source]}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${ACTION_TONE_CLASS[suggestion.suggestedNextAction]}`}>
                    {NEXT_ACTION_LABELS[suggestion.suggestedNextAction]}
                  </span>
                </div>

                <p className="text-sm leading-6 text-neutral-300">{suggestion.description}</p>

                <dl className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                      Client cible
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-neutral-300">
                      {suggestion.targetCustomer}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                      Canal principal
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-neutral-300">
                      {suggestion.primaryChannel}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                      Problème
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-neutral-300">
                      {suggestion.problem}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                      Offre
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-neutral-300">{suggestion.offer}</dd>
                  </div>
                </dl>

                <p className="text-sm leading-6 text-neutral-300">
                  <span className="font-semibold text-white">Raison :</span> {suggestion.rationale}
                </p>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-neutral-300">
                    <BadgeAlert className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
                    {formatEstimatedScoreLabel(suggestion)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-neutral-300">
                    Coût validation : {formatCurrency(suggestion.estimatedCostToValidateCents)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-neutral-300">
                    Délai 1er euro :{" "}
                    {suggestion.estimatedTimeToFirstDollarDays ?? "—"}
                    {suggestion.estimatedTimeToFirstDollarDays ? " jours" : ""}
                  </span>
                </div>

                {suggestion.riskNotes.length > 0 && (
                  <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                      Notes de risque
                    </p>
                    <ul className="mt-2 space-y-1 text-sm leading-6 text-neutral-300">
                      {suggestion.riskNotes.map((note, noteIndex) => (
                        <li key={`${suggestion.id}-risk-${noteIndex}`}>• {note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                  <CheckSquare2 className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
                  <span>
                    Suggested by <span className="text-neutral-300">{suggestion.suggestedBy}</span>
                  </span>
                </div>

                <div className="border-t border-neutral-800/70 pt-3">
                  {isSaved ? (
                    <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Déjà sauvegardée
                    </span>
                  ) : canSaveSuggestions ? (
                    <button
                      type="button"
                      onClick={() => onSaveSuggestion({ suggestionId: suggestion.id })}
                      disabled={pending}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      {pending ? "Sauvegarde…" : "Sauvegarder en candidate"}
                    </button>
                  ) : (
                    <span className="inline-flex min-h-9 items-center rounded-lg border border-neutral-800 px-3 text-sm font-semibold text-neutral-500">
                      Revue uniquement
                    </span>
                  )}
                  <p className="mt-2 text-[11px] leading-5 text-neutral-500">
                    Sauvegarde possible uniquement comme candidate, sans score CEO et sans étape de
                    validation active.
                  </p>
                </div>
              </div>
            </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-4 text-sm leading-6 text-neutral-400">
          Aucune suggestion simulée disponible.
        </div>
      )}
    </section>
  );
}
