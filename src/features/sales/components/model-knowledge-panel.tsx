"use client";

// Model knowledge panel — microlearning for new Chevy / Buick / GMC stock.

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  GraduationCap,
  MessageCircle,
  ShieldQuestion,
} from "lucide-react";
import type { ModelKnowledgeCard } from "@/features/sales/gm-model-knowledge";
import { formatKnowledgeStudySheet } from "@/features/sales/gm-model-knowledge";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function readProgress(cardId: string): Record<number, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`oria-learn-${cardId}`);
    return raw ? (JSON.parse(raw) as Record<number, boolean>) : {};
  } catch {
    return {};
  }
}

export function ModelKnowledgePanel({
  card,
  stockLabel,
  onClose,
}: {
  card: ModelKnowledgeCard;
  stockLabel?: string;
  onClose?: () => void;
}) {
  const [checked, setChecked] = useState<Record<number, boolean>>(() => readProgress(card.id));
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"must" | "walk" | "vs" | "obj">("must");

  function toggleCheck(index: number) {
    setChecked((prev) => {
      const next = { ...prev, [index]: !prev[index] };
      try {
        window.localStorage.setItem(`oria-learn-${card.id}`, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const mastered = card.mustKnowFr.filter((_, i) => checked[i]).length;
  const total = card.mustKnowFr.length;
  const progress = total === 0 ? 0 : Math.round((mastered / total) * 100);

  return (
    <section
      id="sales-model-knowledge"
      className="overflow-hidden rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/[0.08] via-black/30 to-black/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div className="border-b border-white/[0.06] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-500/30 bg-teal-500/15 text-teal-200">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-300/80">
                Formation modèle neuf
              </p>
              <h3 className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                {card.make} {card.model}
              </h3>
              <p className="mt-1 text-xs text-neutral-400">
                {card.segmentFr}
                {stockLabel ? ` · ${stockLabel}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void copyText(formatKnowledgeStudySheet(card)).then((ok) => {
                  if (ok) {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }
                });
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-xs font-semibold text-neutral-200 hover:border-teal-500/40"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copied ? "Copié" : "Fiche étude"}
            </button>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-10 items-center rounded-xl border border-neutral-800 px-3 text-xs text-neutral-400 hover:text-white"
              >
                Fermer
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <StoryTile label="Usage" text={card.threeLineStory.useCaseFr} />
          <StoryTile label="Vs marché" text={card.threeLineStory.vsCompetitorFr} />
          <StoryTile label="Pourquoi ici" text={card.threeLineStory.whyUsFr} />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-neutral-400">
            <span>
              Progression must-know · {mastered}/{total}
            </span>
            <span className="font-semibold text-teal-300">{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-900">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-white/[0.06] px-3 pt-3 sm:px-4">
        {(
          [
            ["must", "À maîtriser", BookOpen],
            ["walk", "Walkaround", MessageCircle],
            ["vs", "Concurrent", ExternalLink],
            ["obj", "Objections", ShieldQuestion],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-t-xl px-3 py-2 text-xs font-semibold transition ${
              tab === id
                ? "bg-white/[0.06] text-teal-100"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        {tab === "must" ? (
          <ul className="space-y-2">
            {card.mustKnowFr.map((item, index) => {
              const done = Boolean(checked[index]);
              return (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => toggleCheck(index)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      done
                        ? "border-teal-500/30 bg-teal-500/10"
                        : "border-neutral-800 bg-neutral-950/60 hover:border-neutral-600"
                    }`}
                  >
                    <CheckCircle2
                      className={`mt-0.5 h-4 w-4 shrink-0 ${done ? "text-teal-300" : "text-neutral-600"}`}
                    />
                    <span className={`text-sm leading-6 ${done ? "text-teal-50" : "text-neutral-200"}`}>
                      {item}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {tab === "walk" ? (
          <ol className="space-y-3">
            {card.walkaroundFr.map((step, i) => (
              <li
                key={`${step.zone}-${i}`}
                className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3"
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-teal-300/80">
                  {i + 1}. {step.zone}
                </p>
                <p className="mt-1 text-sm text-neutral-200">{step.talk}</p>
                <p className="mt-2 text-xs text-amber-200/90">Q — {step.question}</p>
              </li>
            ))}
          </ol>
        ) : null}

        {tab === "vs" ? (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                Feature → bénéfice
              </p>
              <ul className="mt-2 space-y-2">
                {card.featureBenefitsFr.map((row) => (
                  <li
                    key={row.feature}
                    className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-sm"
                  >
                    <span className="font-semibold text-white">{row.feature}</span>
                    <span className="text-neutral-500"> → </span>
                    <span className="text-neutral-300">{row.benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                Set concurrent
              </p>
              <ul className="mt-2 space-y-2">
                {card.competitiveSetFr.map((row) => (
                  <li
                    key={row.rival}
                    className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-sm text-neutral-300"
                  >
                    <span className="font-semibold text-white">{row.rival}</span>
                    <span className="text-neutral-500"> — </span>
                    {row.angle}
                  </li>
                ))}
              </ul>
            </div>
            {card.coldClimateFr.length > 0 ? (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-sky-300">
                  Outaouais / hiver
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-sky-100/90">
                  {card.coldClimateFr.map((n) => (
                    <li key={n}>• {n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "obj" ? (
          <ul className="space-y-3">
            {card.objectionsFr.map((row) => (
              <li
                key={row.objection}
                className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3"
              >
                <p className="text-sm font-semibold text-rose-200/90">« {row.objection} »</p>
                <p className="mt-2 text-sm leading-6 text-neutral-300">{row.reply}</p>
              </li>
            ))}
            {card.learnLinks.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {card.learnLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-800 px-2.5 py-1.5 text-[11px] text-teal-200 hover:border-teal-500/40"
                  >
                    {link.label} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            ) : null}
          </ul>
        ) : null}

        <p className="mt-4 text-[10px] leading-4 text-neutral-600">
          Microlearning vendeur — confirme toujours prix/équipement sur l’étiquette et le guide
          commande. GlobalConnect / AutoBook restent la source officielle OEM.
        </p>
      </div>
    </section>
  );
}

function StoryTile({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-300/70">{label}</p>
      <p className="mt-1.5 text-xs leading-5 text-neutral-200">{text}</p>
    </div>
  );
}
