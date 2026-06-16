"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Info, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import type { MemoryVaultEntry, MemoryVaultEntryType } from "@/server/memory/memory-vault-types";

type MemoryWritePanelProps = {
  /** Pending (`proposed`) entries for the active workspace — the CEO approval queue. */
  pending: MemoryVaultEntry[];
};

const ENTRY_TYPES: { value: MemoryVaultEntryType; label: string }[] = [
  { value: "decision", label: "Décision" },
  { value: "sop", label: "SOP" },
  { value: "note", label: "Note" },
  { value: "source", label: "Source" },
  { value: "doc", label: "Doc" },
];

const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500/40 focus:outline-none";
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500";

export function MemoryWritePanel({ pending }: MemoryWritePanelProps) {
  const router = useRouter();
  const [type, setType] = useState<MemoryVaultEntryType>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function postMemory(body: Record<string, unknown>) {
    const response = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? `API ${response.status}`);
    }
    return data;
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !title.trim() || !content.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const parsedTags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      await postMemory({
        action: "propose",
        type,
        title: title.trim(),
        content: content.trim(),
        ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
        ...(sourceRef.trim() ? { sourceRef: sourceRef.trim() } : {}),
      });
      setTitle("");
      setContent("");
      setTags("");
      setSourceRef("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecision(id: string, action: "approve" | "reject") {
    if (actionId) return;
    setActionId(id);
    setError(null);
    try {
      await postMemory({ action, id });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setActionId(null);
    }
  }

  const createDisabled = submitting || !title.trim() || !content.trim();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-xs leading-5 text-neutral-400">
          Memory Vault encore <span className="text-neutral-300">in-memory</span> — pas de
          persistance Supabase. Les ajouts et approbations peuvent disparaître au redémarrage du
          process. Aucune écriture externe, aucune action agent : approbation CEO locale seulement.
        </p>
      </div>

      <form onSubmit={handleCreate} className="grid gap-3">
        <p className="text-sm font-semibold text-white">Ajouter une mémoire vérifiée</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className={labelClass}>Type</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as MemoryVaultEntryType)}
              className={inputClass}
            >
              {ENTRY_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className={labelClass}>Tags (CSV, optionnel)</span>
            <input
              type="text"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="governance, routing"
              className={inputClass}
            />
          </label>
        </div>
        <label className="grid gap-1">
          <span className={labelClass}>Titre</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Libellé court de la mémoire"
            className={inputClass}
          />
        </label>
        <label className="grid gap-1">
          <span className={labelClass}>Contenu</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Le contenu durable à mémoriser…"
            rows={4}
            className={`${inputClass} resize-y`}
          />
        </label>
        <label className="grid gap-1">
          <span className={labelClass}>Source / réf. (optionnel)</span>
          <input
            type="text"
            value={sourceRef}
            onChange={(event) => setSourceRef(event.target.value)}
            placeholder="AGENTS.md#section, URL, ou PR"
            className={inputClass}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createDisabled}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ajouter (vérifiée)
          </button>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400/80">
            <ShieldCheck className="h-3.5 w-3.5" />
            Entrée CEO → verified directement
          </span>
        </div>
      </form>

      {error ? (
        <div
          className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="grid gap-2">
        <p className={labelClass}>File d&apos;approbation — propositions en attente</p>
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 text-xs text-neutral-600">
            Aucune proposition en attente.
          </p>
        ) : (
          pending.map((entry) => {
            const busy = actionId === entry.id;
            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                    {entry.type} · proposé · {entry.author}
                  </span>
                  <span className="font-mono text-xs text-neutral-600">{entry.id}</span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-white">{entry.title}</h3>
                <p className="mt-1 text-xs leading-5 text-neutral-400">{entry.content}</p>
                <div
                  className={`mt-3 flex gap-2 ${busy ? "pointer-events-none opacity-60" : ""}`}
                  aria-busy={busy}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDecision(entry.id, "approve")}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approuver
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDecision(entry.id, "reject")}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-semibold text-red-200 transition hover:border-red-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    Rejeter
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
