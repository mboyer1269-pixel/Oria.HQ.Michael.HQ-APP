"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, Plus } from "lucide-react";
import type { LocalDraftVentureInput } from "../draft";
import type { VentureCard as VentureCardType } from "../types";
import type {
  SaveVentureDraftActionResult,
  VenturePersistenceMode,
} from "../venture-save-types";
import { VentureCard } from "./venture-card";
import { VentureDetailPanel } from "./venture-detail-panel";
import { VentureIntakeForm } from "./venture-intake-form";

type StatusTone = "saved" | "local" | "demo" | "error";

type StatusBadge = { label: string; tone: StatusTone };

// A card plus how the UI must label its storage truth. `kind` keeps saved,
// demo (example seed), and failed (not-saved) cards strictly separated.
type DisplayCard =
  | { kind: "saved"; card: VentureCardType; storageMode: VenturePersistenceMode | null }
  | { kind: "demo"; card: VentureCardType }
  | { kind: "failed"; card: VentureCardType };

function storageModeLabel(mode: VenturePersistenceMode | null): string {
  switch (mode) {
    case "supabase":
      return "Persistée Supabase";
    case "local":
      return "Fallback local de développement";
    default:
      // Unknown/unavailable mode: stay neutral, never claim a backend.
      return "Sauvegardée via repository";
  }
}

function badgeForDisplayCard(display: DisplayCard): StatusBadge {
  if (display.kind === "saved") {
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
}: {
  seedCards: VentureCardType[];
  savedVentures: VentureCardType[];
  savedStorageMode: VenturePersistenceMode | null;
  loadError?: boolean;
  onSaveDraft: (input: LocalDraftVentureInput) => Promise<SaveVentureDraftActionResult>;
}) {
  // Ventures persisted through the repository (loaded + newly saved this session).
  const [savedCards, setSavedCards] = useState<
    Array<{ card: VentureCardType; storageMode: VenturePersistenceMode | null }>
  >(() => savedVentures.map((card) => ({ card, storageMode: savedStorageMode })));
  // Drafts whose save FAILED — kept visible but never treated as persisted.
  const [failedCards, setFailedCards] = useState<VentureCardType[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [banner, setBanner] = useState<StatusBadge | null>(null);
  const [isPending, startTransition] = useTransition();

  // Demo seed cards are shown ONLY when there is nothing real to show: no saved
  // ventures and no load error. They are always labelled as examples, never as
  // saved ventures.
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

  function handleCreate(input: LocalDraftVentureInput) {
    setBanner(null);
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
        // Do NOT mark as saved. Keep the draft visible, clearly unsaved.
        setFailedCards((prev) => [result.card, ...prev]);
        setSelectedCardId(result.card.id);
        setIsFormOpen(false);
        setBanner({
          label: "Erreur de sauvegarde — la candidate n'est pas persistée.",
          tone: "error",
        });
        return;
      }

      // forbidden — should not happen on the owner-gated surface.
      setBanner({ label: "Accès refusé : sauvegarde non autorisée.", tone: "error" });
    });
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
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {badge.label}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCardId(display.card.id)}
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
            />
          ) : (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 p-6 text-center">
              <p className="text-sm font-medium text-neutral-300">
                Sélectionne une carte pour voir le détail
              </p>
              <p className="text-xs leading-5 text-neutral-500">
                Vue en lecture seule. Utilise « Nouvelle venture » pour créer une candidate et la
                sauvegarder via le repository.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
