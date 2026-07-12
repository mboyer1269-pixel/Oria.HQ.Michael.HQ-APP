"use client";

// Cascading Year / Make / Model selects — options loaded from API only.
 // No free-text inputs. No hardcoded option lists in the component.

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  VehicleCatalogSnapshot,
  VehicleSelection,
} from "@/features/inventory/vehicle-catalog";
import { modelsForMake, resolveSelection } from "@/features/inventory/vehicle-catalog";

export type VehicleMakeModelSelectsProps = {
  /** Initial selection seed (remount with a new `key` when seeding from a stock card). */
  initialValue?: Partial<VehicleSelection> | null;
  onChange: (selection: VehicleSelection | null) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
};

type LoadState = "idle" | "loading" | "ready" | "error";

const selectClass =
  "mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-500/40 disabled:cursor-not-allowed disabled:opacity-40";

export function VehicleMakeModelSelects({
  initialValue,
  onChange,
  disabled = false,
  className,
  size = "md",
}: VehicleMakeModelSelectsProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string>("");
  const [catalog, setCatalog] = useState<VehicleCatalogSnapshot | null>(null);
  const [year, setYear] = useState<number | "">(initialValue?.year ?? "");
  const [makeId, setMakeId] = useState<string>(initialValue?.makeId ?? "");
  const [modelId, setModelId] = useState<string>(initialValue?.modelId ?? "");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/inventory/vehicle-catalog", {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.catalog) {
          throw new Error(payload?.error ?? "Catalogue véhicule indisponible.");
        }
        if (controller.signal.aborted) return;
        const nextCatalog = payload.catalog as VehicleCatalogSnapshot;
        setCatalog(nextCatalog);
        setLoadState("ready");
        const seedYear = initialValue?.year;
        const seedMake = initialValue?.makeId;
        const seedModel = initialValue?.modelId;
        if (seedYear && seedMake && seedModel) {
          onChange(
            resolveSelection(nextCatalog, {
              year: seedYear,
              makeId: seedMake,
              modelId: seedModel,
            }),
          );
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadState("error");
        setError(err instanceof Error ? err.message : "Chargement catalogue échoué.");
      }
    })();
    return () => controller.abort();
    // Mount-only fetch; remount via parent `key` when seed changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredModels = useMemo(() => {
    if (!catalog) return [];
    return modelsForMake(catalog, makeId || null);
  }, [catalog, makeId]);

  function emit(next: { year: number | ""; makeId: string; modelId: string }) {
    if (!catalog || next.year === "" || !next.makeId || !next.modelId) {
      onChange(null);
      return;
    }
    onChange(
      resolveSelection(catalog, {
        year: next.year,
        makeId: next.makeId,
        modelId: next.modelId,
      }),
    );
  }

  function onYearChange(raw: string) {
    const nextYear = raw ? Number.parseInt(raw, 10) : "";
    setYear(nextYear);
    emit({ year: nextYear, makeId, modelId });
  }

  function onMakeChange(nextMakeId: string) {
    setMakeId(nextMakeId);
    setModelId("");
    emit({ year, makeId: nextMakeId, modelId: "" });
  }

  function onModelChange(nextModelId: string) {
    setModelId(nextModelId);
    emit({ year, makeId, modelId: nextModelId });
  }

  const labelClass =
    size === "sm" ? "text-[10px] font-semibold text-neutral-500" : "text-[11px] font-semibold text-neutral-400";

  if (loadState === "loading") {
    return (
      <div className={`flex min-h-11 items-center gap-2 text-xs text-neutral-400 ${className ?? ""}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement marques / modèles…
      </div>
    );
  }

  if (loadState === "error" || !catalog) {
    return (
      <p className={`text-xs text-rose-300 ${className ?? ""}`}>
        {error || "Catalogue indisponible."}
      </p>
    );
  }

  return (
    <div className={`grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3 ${className ?? ""}`}>
      <label className="block">
        <span className={labelClass}>Année</span>
        <select
          value={year === "" ? "" : String(year)}
          disabled={disabled}
          onChange={(e) => onYearChange(e.target.value)}
          className={selectClass}
          aria-label="Année du véhicule"
        >
          <option value="" disabled>
            Choisir…
          </option>
          {catalog.years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelClass}>Marque</span>
        <select
          value={makeId}
          disabled={disabled}
          onChange={(e) => onMakeChange(e.target.value)}
          className={selectClass}
          aria-label="Marque du véhicule"
        >
          <option value="" disabled>
            Choisir…
          </option>
          {catalog.makes.map((make) => (
            <option key={make.makeId} value={make.makeId}>
              {make.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelClass}>Modèle</span>
        <select
          value={modelId}
          disabled={disabled || !makeId}
          onChange={(e) => onModelChange(e.target.value)}
          className={selectClass}
          aria-label="Modèle du véhicule"
        >
          <option value="" disabled>
            {makeId ? "Choisir…" : "Choisir une marque d’abord"}
          </option>
          {filteredModels.map((model) => (
            <option key={model.modelId} value={model.modelId}>
              {model.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
