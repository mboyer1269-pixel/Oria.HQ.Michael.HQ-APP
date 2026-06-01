"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  FlaskConical,
  Lock,
  Pencil,
  Skull,
  X,
} from "lucide-react";
import type { VentureCard, VentureLifecycleStatus } from "../types";
import type { VentureEditableFields } from "../venture-lifecycle-types";
import { VENTURE_STATUS_LABELS } from "../venture-promotion";

type Mode = "none" | "edit" | "archive" | "kill" | "promote";

const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-amber-500/50 focus:outline-none";
const labelClass = "text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500";

export function VentureLifecycleActions({
  card,
  canManage,
  disabledReason,
  isLocked,
  promotableTargets,
  pending,
  error,
  onEdit,
  onArchive,
  onKill,
  onPromote,
}: {
  card: VentureCard;
  canManage: boolean;
  disabledReason?: "demo" | "unsaved";
  isLocked: boolean;
  promotableTargets: VentureLifecycleStatus[];
  pending: boolean;
  error: string | null;
  onEdit: (fields: VentureEditableFields) => void;
  onArchive: (reason: string) => void;
  onKill: (reason: string) => void;
  onPromote: (targetStatus: VentureLifecycleStatus, note: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("none");
  const [name, setName] = useState(card.name);
  const [description, setDescription] = useState(card.description);
  const [targetCustomer, setTargetCustomer] = useState(card.targetCustomer);
  const [problem, setProblem] = useState(card.problem);
  const [offer, setOffer] = useState(card.offer);
  const [primaryChannel, setPrimaryChannel] = useState(card.primaryChannel);
  const [reason, setReason] = useState("");
  const [promoteTarget, setPromoteTarget] = useState<VentureLifecycleStatus | "">(
    promotableTargets[0] ?? "",
  );
  const [promoteNote, setPromoteNote] = useState("");
  const canPromote = promotableTargets.length > 0;

  if (!canManage) {
    const isUnsaved = disabledReason === "unsaved";
    return (
      <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4 text-xs leading-5 text-neutral-400">
        <div className="flex items-center gap-2 text-neutral-300">
          {isUnsaved ? (
            <AlertTriangle className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          )}
          <span className="font-semibold">
            {isUnsaved ? "Carte non sauvegardée" : "Carte démo — exemple"}
          </span>
        </div>
        <p className="mt-2">
          {isUnsaved
            ? "Cette candidate n'a pas été sauvegardée via le repository. Les actions Éditer, Archiver et Tuer ne s'appliquent qu'aux ventures réellement persistées."
            : "Ceci est un exemple de démonstration, pas une venture sauvegardée. Les actions Éditer, Archiver et Tuer ne s'appliquent qu'aux candidates réellement sauvegardées via le repository."}
        </p>
      </section>
    );
  }

  if (isLocked) {
    return (
      <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4 text-xs leading-5 text-neutral-400">
        <div className="flex items-center gap-2 text-neutral-300">
          <Lock className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          <span className="font-semibold">
            {card.status === "archived" ? "Venture archivée" : "Venture tuée"}
          </span>
        </div>
        <p className="mt-2">
          Statut terminal : l&apos;historique est conservé, mais aucune nouvelle action de cycle de
          vie n&apos;est disponible ici. (Aucune suppression définitive en PR150.)
        </p>
      </section>
    );
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onEdit({ name, description, targetCustomer, problem, offer, primaryChannel });
  }

  return (
    <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
          Actions cycle de vie
        </span>
        {mode !== "none" && (
          <button
            type="button"
            onClick={() => {
              setMode("none");
              setReason("");
            }}
            disabled={pending}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {mode === "none" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canPromote && (
            <button
              type="button"
              onClick={() => setMode("promote")}
              disabled={pending}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              Faire avancer
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode("edit")}
            disabled={pending}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-neutral-700 px-3 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900 disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Éditer
          </button>
          <button
            type="button"
            onClick={() => setMode("archive")}
            disabled={pending}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
          >
            <Archive className="h-3.5 w-3.5" />
            Archiver
          </button>
          <button
            type="button"
            onClick={() => setMode("kill")}
            disabled={pending}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
          >
            <Skull className="h-3.5 w-3.5" />
            Tuer
          </button>
        </div>
      )}

      {mode === "edit" && (
        <form onSubmit={submitEdit} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Nom</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Description</span>
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Client cible</span>
            <input
              className={inputClass}
              value={targetCustomer}
              onChange={(e) => setTargetCustomer(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Problème</span>
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Offre</span>
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Canal principal</span>
            <input
              className={inputClass}
              value={primaryChannel}
              onChange={(e) => setPrimaryChannel(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode("none")}
              disabled={pending}
              className="inline-flex min-h-9 items-center rounded-lg border border-neutral-700 px-3 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-9 items-center rounded-lg bg-amber-500 px-3 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400 disabled:opacity-60"
            >
              {pending ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </form>
      )}

      {mode === "promote" && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm leading-6 text-neutral-300">
            Faire avancer la venture d&apos;une étape du cycle de vie. Décision CEO enregistrée à
            titre d&apos;audit — aucune exécution, dépense ou envoi n&apos;est déclenché.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Prochaine étape</span>
            <select
              className={inputClass}
              value={promoteTarget}
              onChange={(e) => setPromoteTarget(e.target.value as VentureLifecycleStatus)}
            >
              {promotableTargets.map((target) => (
                <option key={target} value={target}>
                  {VENTURE_STATUS_LABELS[target]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Note (optionnelle)</span>
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={promoteNote}
              onChange={(e) => setPromoteNote(e.target.value)}
              placeholder="Contexte de la décision (facultatif)"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("none");
                setPromoteNote("");
              }}
              disabled={pending}
              className="inline-flex min-h-9 items-center rounded-lg border border-neutral-700 px-3 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => promoteTarget && onPromote(promoteTarget, promoteNote)}
              disabled={pending || !promoteTarget}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              {pending ? "Traitement…" : "Confirmer l'avancement"}
            </button>
          </div>
        </div>
      )}

      {(mode === "archive" || mode === "kill") && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm leading-6 text-neutral-300">
            {mode === "archive"
              ? "Archiver retire la venture de l'attention active tout en conservant son historique."
              : "Tuer enregistre une décision business définitive (statut tué). L'historique est conservé."}{" "}
            Une raison est obligatoire.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Raison</span>
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "archive" ? "Pourquoi archiver ?" : "Pourquoi tuer ?"}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("none");
                setReason("");
              }}
              disabled={pending}
              className="inline-flex min-h-9 items-center rounded-lg border border-neutral-700 px-3 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => (mode === "archive" ? onArchive(reason) : onKill(reason))}
              disabled={pending || reason.trim().length === 0}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-neutral-950 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                mode === "archive"
                  ? "bg-amber-500 hover:bg-amber-400"
                  : "bg-red-500 text-white hover:bg-red-400"
              }`}
            >
              {mode === "archive" ? <Archive className="h-3.5 w-3.5" /> : <Skull className="h-3.5 w-3.5" />}
              {pending
                ? "Traitement…"
                : mode === "archive"
                  ? "Confirmer l'archivage"
                  : "Confirmer le kill"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
