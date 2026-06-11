"use client";

// Loi 96 pipeline board — P1, Le Pont.
// Each target: status chip → « Préparer » (queues into the Send Desk) →
// the send itself happens ONLY in /hq/outbound via CEO click → « Réponse
// reçue » closes the loop manually (v1; webhook upgrade in P6).

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Hammer,
  Loader2,
  MailQuestion,
  MessageCircleReply,
  SendHorizonal,
} from "lucide-react";
import type { Loi96BoardTarget } from "../loi96-pipeline-action";
import {
  listLoi96BoardAction,
  markLoi96ReplyAction,
  prepareLoi96AuditAction,
} from "../loi96-pipeline-action";

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  to_verify: { label: "À vérifier", cls: "border-neutral-700 bg-neutral-900 text-neutral-400" },
  audit_to_rebuild: { label: "Audit à refaire", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  audit_ready: { label: "Audit prêt", cls: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  queued: { label: "Dans la file — attend ton clic", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  sent: { label: "Envoyé", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  replied: { label: "A répondu 🔥", cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" },
  call_booked: { label: "Appel booké", cls: "border-violet-500/30 bg-violet-500/10 text-violet-300" },
  signed: { label: "SIGNÉ 💰", cls: "border-emerald-500/50 bg-emerald-500/20 text-emerald-100" },
  lost: { label: "Perdu", cls: "border-neutral-800 bg-neutral-900 text-neutral-600" },
};

export function Loi96PipelineBoard() {
  const [targets, setTargets] = useState<Loi96BoardTarget[] | null>(null);
  const [meta, setMeta] = useState<{ weeklyGoal: string; killMetrics: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyDomain, setBusyDomain] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    listLoi96BoardAction().then((result) => {
      if (result.status === "ok") {
        setTargets(result.targets);
        setMeta({ weeklyGoal: result.weeklyGoal, killMetrics: result.killMetrics });
      } else if (result.status === "missing") {
        setError("ventures/loi96/pipeline.json introuvable.");
      }
    });
  }

  useEffect(refresh, []);

  function prepare(domain: string) {
    setBusyDomain(domain);
    setError(null);
    startTransition(async () => {
      const result = await prepareLoi96AuditAction({ domain });
      if (result.status === "error") setError(`${domain} : ${result.message}`);
      setBusyDomain(null);
      refresh();
    });
  }

  function markReply(domain: string) {
    setBusyDomain(domain);
    startTransition(async () => {
      await markLoi96ReplyAction({ domain });
      setBusyDomain(null);
      refresh();
    });
  }

  if (targets === null && !error) {
    return <p className="text-xs text-neutral-600">Chargement du pipeline…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {meta ? (
        <p className="text-xs text-neutral-500">
          Objectif : <span className="font-semibold text-neutral-300">{meta.weeklyGoal}</span>
          <span className="mx-2 text-neutral-700">·</span>
          Kill metric : {meta.killMetrics[0]}
        </p>
      ) : null}
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {(targets ?? []).map((target) => {
          const chip = STATUS_CHIP[target.status] ?? STATUS_CHIP.to_verify;
          const busy = busyDomain === target.domain;
          const canPrepare =
            !target.outboundActionId &&
            target.status !== "signed" &&
            target.status !== "lost" &&
            Boolean(target.contact?.includes("@"));
          const canMarkReply = target.status === "sent" || target.liveStatus === "sent";

          return (
            <article
              key={target.domain}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3 transition hover:border-neutral-700"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-bold text-white">{target.name}</span>
                  <span className="font-mono text-xs text-neutral-500">{target.domain}</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}
                  >
                    {chip.label}
                  </span>
                  <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-500">
                    T{target.tier}
                  </span>
                </p>
                <p className="mt-1 truncate text-xs text-neutral-500">{target.angle}</p>
                {!target.contact?.includes("@") ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-400/80">
                    <MailQuestion className="h-3 w-3" />
                    Pas de courriel direct — {target.contact ?? "contact à trouver"}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {canMarkReply ? (
                  <button
                    type="button"
                    onClick={() => markReply(target.domain)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
                  >
                    <MessageCircleReply className="h-3.5 w-3.5" />
                    Réponse reçue
                  </button>
                ) : null}
                {target.outboundActionId ? (
                  <Link
                    href={"/hq/outbound" as Route}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"
                  >
                    <SendHorizonal className="h-3.5 w-3.5" />
                    Voir au Send Desk
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                ) : canPrepare ? (
                  <button
                    type="button"
                    onClick={() => prepare(target.domain)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Hammer className="h-3.5 w-3.5" />
                    )}
                    Préparer l&apos;audit
                  </button>
                ) : target.status === "signed" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <p className="border-t border-neutral-900 pt-2 text-[11px] leading-5 text-neutral-600">
        « Préparer » dépose le courriel d&apos;audit dans le Send Desk — rien ne part sans ton
        clic là-bas. Hermès rédige, Thémis valide, toi tu décides.
      </p>
    </div>
  );
}
