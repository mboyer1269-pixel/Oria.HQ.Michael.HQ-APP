"use client";

// Venture Asset Panel — progressive operational details on a venture card.
//
// Nothing is required at creation: assets are added stage by stage. The panel
// shows (1) the stage-readiness checklist, (2) active assets grouped by kind,
// (3) a compact add form, and (4) the close-out inventory hint for kills.

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AtSign,
  CheckCircle2,
  CircleDashed,
  Globe,
  KeyRound,
  Loader2,
  Package,
  Plus,
  Trash2,
} from "lucide-react";
import type { VentureLifecycleStatus } from "../types";
import {
  VENTURE_ASSET_KIND_LABELS,
  computeVentureReadiness,
  getCloseoutInventory,
  projectActiveAssets,
  type VentureAssetKind,
  type VentureAssetRecord,
} from "../venture-asset";
import {
  addVentureAssetAction,
  listVentureAssetsAction,
  retireVentureAssetAction,
} from "../venture-asset-action";

const KIND_OPTIONS = Object.entries(VENTURE_ASSET_KIND_LABELS) as [VentureAssetKind, string][];

function maskedValue(record: VentureAssetRecord): string {
  if (!record.sensitive) return record.value;
  if (record.value.length <= 4) return "••••";
  return `${record.value.slice(0, 2)}••••${record.value.slice(-2)}`;
}

export function VentureAssetPanel({
  ventureId,
  ventureStatus,
}: {
  ventureId: string;
  ventureStatus: VentureLifecycleStatus;
}) {
  const [records, setRecords] = useState<VentureAssetRecord[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<VentureAssetKind>("dedicated_email");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listVentureAssetsAction({ ventureId }).then((result) => {
      if (!cancelled && result.status === "ok") setRecords(result.assets);
    });
    return () => {
      cancelled = true;
    };
  }, [ventureId]);

  const active = useMemo(() => projectActiveAssets(records ?? []), [records]);
  const readiness = useMemo(
    () => computeVentureReadiness(records ?? [], ventureStatus),
    [records, ventureStatus],
  );
  const closeout = useMemo(() => getCloseoutInventory(records ?? []), [records]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addVentureAssetAction({ ventureId, kind, label, value, sensitive });
      if (result.status === "saved") {
        setRecords((current) => [...(current ?? []), result.asset]);
        setLabel("");
        setValue("");
        setSensitive(false);
        setFormOpen(false);
      } else if (result.status === "error") {
        setError(result.message);
      } else {
        setError("Accès refusé.");
      }
    });
  }

  function retire(assetId: string) {
    startTransition(async () => {
      const result = await retireVentureAssetAction({ assetId, reason: "retiré par le CEO" });
      if (result.status === "saved") {
        setRecords((current) =>
          (current ?? []).map((record) => (record.id === assetId ? result.asset : record)),
        );
      }
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-neutral-500" />
          <h4 className="text-sm font-bold text-white">Actifs opérationnels</h4>
          <span className="text-xs text-neutral-600">({active.length} actifs)</span>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs font-semibold text-neutral-300 transition hover:border-neutral-500 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </button>
      </div>

      {readiness.recommended.length > 0 ? (
        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Préparation pour « {ventureStatus} » — {readiness.present.length}/
            {readiness.recommended.length}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {readiness.recommended.map((recommendedKind) => {
              const present = readiness.present.includes(recommendedKind);
              return (
                <li
                  key={recommendedKind}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                    present
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-neutral-700 bg-neutral-900 text-neutral-500"
                  }`}
                >
                  {present ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <CircleDashed className="h-3 w-3" />
                  )}
                  {VENTURE_ASSET_KIND_LABELS[recommendedKind]}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs text-neutral-600">
          Rien d&apos;exigé à ce stade — on ajoute les actifs au fur et à mesure que la venture
          prouve sa valeur.
        </p>
      )}

      {formOpen ? (
        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as VentureAssetKind)}
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-xs text-neutral-200"
            >
              {KIND_OPTIONS.map(([optionKind, optionLabel]) => (
                <option key={optionKind} value={optionKind}>
                  {optionLabel}
                </option>
              ))}
            </select>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Libellé (ex. Courriel support clients)"
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-600"
            />
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Valeur (ex. support@maboutique.com)"
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 sm:col-span-2"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={sensitive}
                onChange={(event) => setSensitive(event.target.checked)}
                className="h-3.5 w-3.5 accent-amber-500"
              />
              <KeyRound className="h-3 w-3" />
              Sensible (valeur masquée)
            </label>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Enregistrer
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
        </div>
      ) : null}

      {records === null ? (
        <p className="mt-3 text-xs text-neutral-600">Chargement…</p>
      ) : active.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {active.map((record) => (
            <li
              key={record.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                {record.kind === "dedicated_email" ? (
                  <AtSign className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                ) : record.kind === "domain" ? (
                  <Globe className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                ) : (
                  <Package className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-neutral-200">
                    {record.label}
                    <span className="ml-2 font-normal text-neutral-500">
                      {VENTURE_ASSET_KIND_LABELS[record.kind]}
                    </span>
                  </p>
                  <p className="truncate text-xs text-neutral-400">{maskedValue(record)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => retire(record.id)}
                disabled={isPending}
                title="Retirer (conservé dans l'historique)"
                className="rounded-lg border border-neutral-800 p-1.5 text-neutral-500 transition hover:border-rose-500/40 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-neutral-600">Aucun actif pour l&apos;instant.</p>
      )}

      {closeout.length > 0 ? (
        <p className="mt-3 border-t border-neutral-800 pt-2 text-xs text-neutral-600">
          Si cette venture est tuée : {closeout.length} actif(s) à fermer —{" "}
          {closeout.map((record) => record.label).join(", ")}.
        </p>
      ) : null}
    </section>
  );
}
