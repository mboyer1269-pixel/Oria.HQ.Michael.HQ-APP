"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Archive, CheckCircle2, FlaskConical, Plus, Skull } from "lucide-react";
import type { LocalDraftVentureInput } from "../draft";
import type { VentureCard as VentureCardType } from "../types";
import type { VentureLifecycleStatus } from "../types";
import type {
  VentureEditableFields,
  VentureLifecycleActionInput,
  VentureLifecycleActionResult,
  VentureLifecycleErrorCode,
  VenturePromotionInput,
  VentureScoringInput,
  VentureUpdateInput,
} from "../venture-lifecycle-types";
import { getPromotableTargets } from "../venture-promotion";
import type { VentureScoreRecommendation, VentureSubScores } from "../venture-scoring";
import type {
  SaveVentureDraftActionResult,
  VenturePersistenceMode,
} from "../venture-save-types";
import { VentureCard } from "./venture-card";
import { VentureDetailPanel } from "./venture-detail-panel";
import { VentureIntakeForm } from "./venture-intake-form";
import { VentureLifecycleActions } from "./venture-lifecycle-actions";

type StatusTone = "saved" | "local" | "demo" | "error";

type StatusBadge = { label: string; tone: StatusTone };

// A card plus how the UI must label its storage truth. `kind` keeps saved,
// demo (example seed), and failed (not-saved) cards strictly separated.
type DisplayCard =
  | { kind: "saved"; card: VentureCardType; storageMode: VenturePersistenceMode | null }
  | { kind: "demo"; card: VentureCardType }
  | { kind: "failed"; card: VentureCardType };

const LOCKED_STATUSES = new Set(["archived", "killed"]);

function storageModeLabel(mode: VenturePersistenceMode | null): string {
  switch (mode) {
    case "supabase":
      return "Persistée Supabase";
    case "local":
      return "Fallback local de développement";
    default:
      return "Sauvegardée via repository";
  }
}

function lifecycleErrorMessage(code: VentureLifecycleErrorCode): string {
  switch (code) {
    case "not_found":
      return "Venture introuvable dans ce workspace — rien n'a été modifié.";
    case "invalid_reason":
      return "Une raison non vide est obligatoire pour archiver ou tuer.";
    case "invalid_score":
      return "Score invalide : les 11 dimensions doivent être notées de 0 à 10.";
    case "no_changes":
      return "Aucune modification détectée.";
    case "not_editable":
      return "Venture en statut terminal : édition indisponible.";
    case "illegal_transition":
      return "Avancement non autorisé pour ce statut.";
    default:
      return "Erreur de sauvegarde — la modification n'est pas persistée.";
  }
}

function badgeForDisplayCard(display: DisplayCard): StatusBadge {
  if (display.kind === "saved") {
    if (display.card.status === "archived") {
      return { label: "Archivée — historique conservé", tone: "demo" };
    }
    if (display.card.status === "killed") {
      return { label: "Tuée — décision business", tone: "error" };
    }
    const tone: StatusTone = display.storageMode === "supabase" ? "saved" : "local";
    return { label: `Candidate sauvegardée · ${storageModeLabel(display.storageMode)}`, tone };
  }
  if (display.kind === "failed") {
    return { label: "Non sauvegardée — erreur de sauvegarde", tone: "error" };
  }
  return { label: "Exemple — démo (non sauvegardée)", tone: "demo" };
}

const TONE_BADGE_CLASS: Record<StatusTone, string> = {
  saved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  local: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  demo: "border-neutral-700 bg-neutral-900 text-neutral-400",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
};

export function VentureCommandCenterClient({
  seedCards,
  savedVentures,
  savedStorageMode,
  loadError = false,
  onSaveDraft,
  onUpdateDetails,
  onArchive,
  onKill,
  onPromote,
  onScore,
}: {
  seedCards: VentureCardType[];
  savedVentures: VentureCardType[];
  savedStorageMode: VenturePersistenceMode | null;
  loadError?: boolean;
  onSaveDraft: (input: LocalDraftVentureInput) => Promise<SaveVentureDraftActionResult>;
  onUpdateDetails: (input: VentureUpdateInput) => Promise<VentureLifecycleActionResult>;
  onArchive: (input: VentureLifecycleActionInput) => Promise<VentureLifecycleActionResult>;
  onKill: (input: VentureLifecycleActionInput) => Promise<VentureLifecycleActionResult>;
  onPromote: (input: VenturePromotionInput) => Promise<VentureLifecycleActionResult>;
  onScore: (input: VentureScoringInput) => Promise<VentureLifecycleActionResult>;
}) {
  const [savedCards, setSavedCards] = useState<
    Array<{ card: VentureCardType; storageMode: VenturePersistenceMode | null }>
  >(() => savedVentures.map((card) => ({ card, storageMode: savedStorageMode })));
  const [failedCards, setFailedCards] = useState<VentureCardType[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [banner, setBanner] = useState<StatusBadge | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showDemo = savedCards.length === 0 && !loadError;

  const displayCards: DisplayCard[] = useMemo(() => {
    const failed: DisplayCard[] = failedCards.map((card) => ({ kind: "failed", card }));
    const saved: DisplayCard[] = savedCards.map(({ card, storageMode }) => ({
      kind: "saved",
      card,
      storageMode,
    }));
    const demo: DisplayCard[] = showDemo
      ? seedCards.map((card) => ({ kind: "demo", card }))
      : [];
    return [...failed, ...saved, ...demo];
  }, [failedCards, savedCards, seedCards, showDemo]);

  const selected = displayCards.find((d) => d.card.id === selectedCardId) ?? null;

  function selectCard(id: string) {
    setSelectedCardId(id);
    setLifecycleError(null);
  }

  function handleCreate(input: LocalDraftVentureInput) {
    setBanner(null);
    setLifecycleError(null);
    startTransition(async () => {
      const result = await onSaveDraft(input);

      if (result.status === "saved") {
        setSavedCards((prev) => [{ card: result.card, storageMode: result.storageMode }, ...prev]);
        setFailedCards((prev) => prev.filter((c) => c.id !== result.card.id));
        setSelectedCardId(result.card.id);
        setIsFormOpen(false);
        setBanner({
          label: `Candidate sauvegardée · ${storageModeLabel(result.storageMode)}`,
          tone: result.storageMode === "supabase" ? "saved" : "local",
        });
        return;
      }

      if (result.status === "error") {
        setFailedCards((prev) => [result.card, ...prev]);
        setSelectedCardId(result.card.id);
        setIsFormOpen(false);
        setBanner({
          label: "Erreur de sauvegarde — la candidate n'est pas persistée.",
          tone: "error",
        });
        return;
      }

      setBanner({ label: "Accès refusé : sauvegarde non autorisée.", tone: "error" });
    });
  }

  // Runs a lifecycle server action and reconciles client state with the result.
  function runLifecycle(action: () => Promise<VentureLifecycleActionResult>, successLabel: string) {
    setLifecycleError(null);
    setBanner(null);
    startTransition(async () => {
      const result = await action();

      if (result.status === "saved") {
        setSavedCards((prev) =>
          prev.map((entry) =>
            entry.card.id === result.card.id
              ? { card: result.card, storageMode: result.storageMode }
              : entry,
          ),
        );
        setSelectedCardId(result.card.id);
        setBanner({
          label: `${successLabel} · ${storageModeLabel(result.storageMode)}`,
          tone: result.storageMode === "supabase" ? "saved" : "local",
        });
        return;
      }

      if (result.status === "forbidden") {
        setLifecycleError("Accès refusé : action non autorisée.");
        return;
      }

      // Failure: never pretend success. Surface a clear error, leave card as-is.
      setLifecycleError(lifecycleErrorMessage(result.code));
    });
  }

  function handleEdit(card: VentureCardType, fields: VentureEditableFields) {
    runLifecycle(() => onUpdateDetails({ ventureId: card.id, fields }), "Détails mis à jour");
  }
  function handleArchive(card: VentureCardType, reason: string) {
    runLifecycle(() => onArchive({ ventureId: card.id, reason }), "Venture archivée");
  }
  function handleKill(card: VentureCardType, reason: string) {
    runLifecycle(() => onKill({ ventureId: card.id, reason }), "Venture tuée");
  }
  function handlePromote(
    card: VentureCardType,
    targetStatus: VentureLifecycleStatus,
    note: string,
  ) {
    runLifecycle(
      () => onPromote({ ventureId: card.id, targetStatus, note }),
      "Venture avancée",
    );
  }
  function handleScore(
    card: VentureCardType,
    scores: VentureSubScores,
    recommendation?: VentureScoreRecommendation,
  ) {
    runLifecycle(
      () => onScore({ ventureId: card.id, scores, recommendation }),
      "Venture scorée",
    );
  }

  function renderActions(display: DisplayCard) {
    const card = display.card;
    if (display.kind !== "saved") {
      return (
        <VentureLifecycleActions
          key={card.id}
          card={card}
          canManage={false}
          disabledReason={display.kind === "failed" ? "unsaved" : "demo"}
          isLocked={false}
          promotableTargets={[]}
          pending={isPending}
          error={null}
          onEdit={() => {}}
          onArchive={() => {}}
          onKill={() => {}}
          onPromote={() => {}}
          onScore={() => {}}
        />
      );
    }
    return (
      <VentureLifecycleActions
        key={card.id}
        card={card}
        canManage
        isLocked={LOCKED_STATUSES.has(card.status)}
        promotableTargets={getPromotableTargets(card.status)}
        pending={isPending}
        error={lifecycleError}
        onEdit={(fields) => handleEdit(card, fields)}
        onArchive={(reason) => handleArchive(card, reason)}
        onKill={(reason) => handleKill(card, reason)}
        onPromote={(target, note) => handlePromote(card, target, note)}
        onScore={(scores, recommendation) => handleScore(card, scores, recommendation)}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Cartes ventures
          </h2>
          <p className="mt-1 text-[11px] text-neutral-500">
            {savedCards.length > 0
              ? `${savedCards.length} candidate${savedCards.length > 1 ? "s" : ""} sauvegardée${
                  savedCards.length > 1 ? "s" : ""
                }`
              : loadError
                ? "Chargement indisponible"
                : `${seedCards.length} exemple${seedCards.length > 1 ? "s" : ""} démo (non sauvegardé${
                    seedCards.length > 1 ? "s" : ""
                  })`}
            {failedCards.length > 0
              ? ` · ${failedCards.length} non sauvegardée${failedCards.length > 1 ? "s" : ""}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsFormOpen((open) => !open)}
          aria-expanded={isFormOpen}
          disabled={isPending}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 self-start rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Nouvelle venture
        </button>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Impossible de charger les ventures sauvegardées depuis le repository. Les exemples démo
            sont masqués pour ne pas laisser croire à des données réelles. Réessaie plus tard.
          </span>
        </div>
      )}

      {banner && (
        <div
          className={`flex items-start gap-2 rounded-2xl border p-4 text-sm leading-6 ${TONE_BADGE_CLASS[banner.tone]}`}
          role="status"
        >
          {banner.tone === "error" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{banner.label}</span>
        </div>
      )}

      {isFormOpen && (
        <VentureIntakeForm onCreate={handleCreate} onCancel={() => setIsFormOpen(false)} />
      )}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {displayCards.map((display) => {
            const badge = badgeForDisplayCard(display);
            const isSelected = display.card.id === selectedCardId;
            return (
              <div key={display.card.id} className="flex flex-col gap-1.5">
                <span
                  className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TONE_BADGE_CLASS[badge.tone]}`}
                >
                  {display.kind === "demo" ? (
                    <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : display.kind === "failed" ? (
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : display.card.status === "archived" ? (
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : display.card.status === "killed" ? (
                    <Skull className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {badge.label}
                </span>
                <button
                  type="button"
                  onClick={() => selectCard(display.card.id)}
                  aria-pressed={isSelected}
                  className={`flex h-full rounded-2xl text-left transition focus:outline-none ${
                    isSelected
                      ? "ring-2 ring-amber-500/60"
                      : "ring-1 ring-transparent hover:ring-neutral-700"
                  }`}
                >
                  <VentureCard card={display.card} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          {selected ? (
            <VentureDetailPanel
              card={selected.card}
              statusBadge={badgeForDisplayCard(selected)}
              actions={renderActions(selected)}
            />
          ) : (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 p-6 text-center">
              <p className="text-sm font-medium text-neutral-300">
                Sélectionne une carte pour voir le détail
              </p>
              <p className="text-xs leading-5 text-neutral-500">
                Crée une candidate via « Nouvelle venture », puis édite, archive ou tue une venture
                sauvegardée depuis son panneau de détail.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
