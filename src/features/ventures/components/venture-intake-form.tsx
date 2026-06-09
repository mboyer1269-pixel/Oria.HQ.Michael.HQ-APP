"use client";

import { useState } from "react";
import { Info, Sparkles, X } from "lucide-react";
import { LOCAL_DRAFT_VENTURE_LABEL, type LocalDraftVentureInput } from "../draft";

const WINDOW_OPTIONS: Array<7 | 30 | 60 | 90> = [7, 30, 60, 90];

type IntakeFormState = {
  name: string;
  description: string;
  targetCustomer: string;
  problem: string;
  offer: string;
  primaryChannel: string;
  hypothesis: string;
  validationWindowDays: 7 | 30 | 60 | 90;
  budgetCapEuros: string;
  firstSuccessMetric: string;
  firstKillMetric: string;
  firstKillThreshold: string;
};

const EMPTY_STATE: IntakeFormState = {
  name: "",
  description: "",
  targetCustomer: "",
  problem: "",
  offer: "",
  primaryChannel: "",
  hypothesis: "",
  validationWindowDays: 30,
  budgetCapEuros: "0",
  firstSuccessMetric: "",
  firstKillMetric: "",
  firstKillThreshold: "",
};

const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-amber-500/50 focus:outline-none";
const labelClass = "text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500";

export function VentureIntakeForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: LocalDraftVentureInput) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<IntakeFormState>(EMPTY_STATE);

  function update<K extends keyof IntakeFormState>(key: K, value: IntakeFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedEuros = Number.parseFloat(state.budgetCapEuros.replace(",", "."));
    const budgetCapCents = Number.isFinite(parsedEuros)
      ? Math.max(0, Math.round(parsedEuros * 100))
      : 0;

    onCreate({
      name: state.name,
      description: state.description,
      targetCustomer: state.targetCustomer,
      problem: state.problem,
      offer: state.offer,
      primaryChannel: state.primaryChannel,
      hypothesis: state.hypothesis,
      validationWindowDays: state.validationWindowDays,
      budgetCapCents,
      firstSuccessMetric: state.firstSuccessMetric,
      firstKillMetric: state.firstKillMetric,
      firstKillThreshold: state.firstKillThreshold,
    });

    setState(EMPTY_STATE);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-3xl border border-amber-500/20 bg-neutral-950/80 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Nouvelle venture
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">Intake venture</h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200"
          aria-label="Fermer le formulaire"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-200">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Cette carte sera un <strong>{LOCAL_DRAFT_VENTURE_LABEL}</strong> : elle vit uniquement dans
          ce navigateur, n&apos;est pas enregistrée côté serveur et disparaît au rechargement de la
          page. Aucune dépense ni aucun envoi n&apos;est déclenché.
        </span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>Nom</span>
          <input
            required
            className={inputClass}
            value={state.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Nom de la venture"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>Description</span>
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={state.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Idée en une ou deux phrases"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Client cible</span>
          <input
            className={inputClass}
            value={state.targetCustomer}
            onChange={(e) => update("targetCustomer", e.target.value)}
            placeholder="À qui s'adresse l'offre"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Canal principal</span>
          <input
            className={inputClass}
            value={state.primaryChannel}
            onChange={(e) => update("primaryChannel", e.target.value)}
            placeholder="Comment atteindre le client"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>Problème</span>
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={state.problem}
            onChange={(e) => update("problem", e.target.value)}
            placeholder="Le problème résolu"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>Offre</span>
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={state.offer}
            onChange={(e) => update("offer", e.target.value)}
            placeholder="Ce qui est proposé"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>Hypothèse</span>
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={state.hypothesis}
            onChange={(e) => update("hypothesis", e.target.value)}
            placeholder="Ce que la validation doit prouver"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Fenêtre de validation</span>
          <select
            className={inputClass}
            value={state.validationWindowDays}
            onChange={(e) =>
              update("validationWindowDays", Number(e.target.value) as 7 | 30 | 60 | 90)
            }
          >
            {WINDOW_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} jours
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Budget cap ($ CA)</span>
          <input
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            className={inputClass}
            value={state.budgetCapEuros}
            onChange={(e) => update("budgetCapEuros", e.target.value)}
            placeholder="0"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>Première métrique de succès</span>
          <input
            className={inputClass}
            value={state.firstSuccessMetric}
            onChange={(e) => update("firstSuccessMetric", e.target.value)}
            placeholder="Ex. 3 entretiens qualifiés réalisés"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Métrique de kill</span>
          <input
            className={inputClass}
            value={state.firstKillMetric}
            onChange={(e) => update("firstKillMetric", e.target.value)}
            placeholder="Ex. qualified_interviews"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Seuil de kill</span>
          <input
            className={inputClass}
            value={state.firstKillThreshold}
            onChange={(e) => update("firstKillThreshold", e.target.value)}
            placeholder="Ex. < 3 en 30 jours"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-800/60 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
        >
          <Sparkles className="h-4 w-4" />
          Créer le brouillon local
        </button>
      </div>
    </form>
  );
}
