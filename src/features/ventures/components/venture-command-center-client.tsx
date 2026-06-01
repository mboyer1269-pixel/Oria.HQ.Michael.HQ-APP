"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import {
  createLocalDraftVentureCard,
  isLocalDraftVentureCard,
  LOCAL_DRAFT_VENTURE_LABEL,
  type LocalDraftVentureInput,
} from "../draft";
import type { VentureCard as VentureCardType } from "../types";
import { VentureCard } from "./venture-card";
import { VentureDetailPanel } from "./venture-detail-panel";
import { VentureIntakeForm } from "./venture-intake-form";

export function VentureCommandCenterClient({
  initialCards,
}: {
  initialCards: VentureCardType[];
}) {
  // Server-provided seed cards are read-only; local drafts live only in this
  // client session (no server write, no persistence). Drafts are listed first
  // so a freshly created card is immediately visible.
  const [previewCards, setPreviewCards] = useState<VentureCardType[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const allCards = useMemo(
    () => [...previewCards, ...initialCards],
    [previewCards, initialCards],
  );

  const selectedCard =
    allCards.find((card) => card.id === selectedCardId) ?? null;

  function handleCreate(input: LocalDraftVentureInput) {
    const draft = createLocalDraftVentureCard(input);
    setPreviewCards((prev) => [draft, ...prev]);
    setSelectedCardId(draft.id);
    setIsFormOpen(false);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Cartes ventures
          </h2>
          <p className="mt-1 text-[11px] text-neutral-500">
            {initialCards.length} carte{initialCards.length > 1 ? "s" : ""} de référence
            {previewCards.length > 0
              ? ` · ${previewCards.length} brouillon${previewCards.length > 1 ? "s" : ""} local${
                  previewCards.length > 1 ? "aux" : ""
                } (non persistant${previewCards.length > 1 ? "s" : ""})`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsFormOpen((open) => !open)}
          aria-expanded={isFormOpen}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 self-start rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
        >
          <Plus className="h-4 w-4" />
          Nouvelle venture
        </button>
      </div>

      {isFormOpen && (
        <VentureIntakeForm onCreate={handleCreate} onCancel={() => setIsFormOpen(false)} />
      )}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {allCards.map((card) => {
            const isLocalDraft = isLocalDraftVentureCard(card);
            const isSelected = card.id === selectedCardId;
            return (
              <div key={card.id} className="flex flex-col gap-1.5">
                {isLocalDraft && (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {LOCAL_DRAFT_VENTURE_LABEL}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCardId(card.id)}
                  aria-pressed={isSelected}
                  className={`flex h-full rounded-2xl text-left transition focus:outline-none ${
                    isSelected
                      ? "ring-2 ring-amber-500/60"
                      : "ring-1 ring-transparent hover:ring-neutral-700"
                  }`}
                >
                  <VentureCard card={card} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          {selectedCard ? (
            <VentureDetailPanel
              card={selectedCard}
              isLocalDraft={isLocalDraftVentureCard(selectedCard)}
            />
          ) : (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 p-6 text-center">
              <p className="text-sm font-medium text-neutral-300">
                Sélectionne une carte pour voir le détail
              </p>
              <p className="text-xs leading-5 text-neutral-500">
                Vue en lecture seule. Utilise « Nouvelle venture » pour créer un brouillon local
                non persistant.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
