"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Route } from "next";
import Link from "next/link";
import { AlertCircle, Loader2, MessageSquare, Minimize2, Send } from "lucide-react";
import { MISSION_DRAFT_CHANGED_EVENT } from "@/features/hq/mission-draft-format";
import {
  APPROVAL_RESOLVED_EVENT,
  type ApprovalResolvedDetail,
} from "@/features/hq/approval-resolved-event";

// ---------------------------------------------------------------------------
// Joris dock — omnipresent conversation surface.
//
// Functional: posts to the real /api/joris/chat endpoint (same contract as the
// Command Center). Conversation only — autonomous activity lives elsewhere so
// the thread does not become a confusing activity log. Joris proposes and
// prepares; it never executes from here.
// ---------------------------------------------------------------------------

type ChatResponse = {
  summary: string;
  intent?: string;
  requiresConfirmation?: boolean;
  calendarEvent?: { id?: string } | null;
  pendingDraftId?: string;
  missionDraftPreview?: { title?: string } | null;
  error?: string;
};

type Turn = {
  role: "user" | "joris";
  text: string;
  muted?: boolean;
  requiresConfirmation?: boolean;
  href?: string;
};

const SEED: Turn[] = [
  {
    role: "joris",
    text: "Bonjour Michael. Je propose, prépare et recommande; jamais d'exécution sans ton aval, un ledger et des bornes. Que veux-tu faire ?",
  },
];

function toUserError(error: unknown) {
  const message = error instanceof Error ? error.message : "Joris est temporairement indisponible.";
  if (/Joris API 401/.test(message) || /\b401\b/.test(message)) {
    return "Joris nécessite une session active (Supabase) pour répondre. Connecte-toi via /login, puis réessaie.";
  }
  if (/Joris API \d+/.test(message)) {
    return "Joris ne répond pas pour le moment. Réessaie dans quelques instants.";
  }
  return message;
}

function notifySideEffects(data: ChatResponse) {
  if (data.intent === "mission.draft" || data.missionDraftPreview || data.pendingDraftId) {
    window.dispatchEvent(new CustomEvent(MISSION_DRAFT_CHANGED_EVENT));
  }
  if (data.intent === "calendar.book" || data.calendarEvent) {
    window.dispatchEvent(new CustomEvent("michael-hq:calendar-changed"));
    window.dispatchEvent(new CustomEvent(MISSION_DRAFT_CHANGED_EVENT));
  }
}

export function JorisDock() {
  const [open, setOpen] = useState(true);
  const [turns, setTurns] = useState<Turn[]>(SEED);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [turns, loading, open]);

  useEffect(() => {
    function onApprovalResolved(event: Event) {
      const detail = (event as CustomEvent<ApprovalResolvedDetail>).detail;
      if (!detail?.summary) return;
      setOpen(true);
      setTurns((prev) => [
        ...prev,
        {
          role: "joris",
          text: detail.summary,
          href: detail.href,
        },
      ]);
    }

    window.addEventListener(APPROVAL_RESOLVED_EVENT, onApprovalResolved);
    return () => window.removeEventListener(APPROVAL_RESOLVED_EVENT, onApprovalResolved);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = command.trim();
    if (!text || loading) return;

    setTurns((prev) => [...prev, { role: "user", text }]);
    setCommand("");
    setLoading(true);

    try {
      const response = await fetch("/api/joris/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, locale: "fr-CA" }),
      });
      const data = (await response.json()) as ChatResponse;
      if (!response.ok) throw new Error(data.error ?? `Joris API ${response.status}`);
      notifySideEffects(data);
      setTurns((prev) => [
        ...prev,
        {
          role: "joris",
          text: data.summary,
          requiresConfirmation: Boolean(data.requiresConfirmation),
        },
      ]);
    } catch (err) {
      setTurns((prev) => [...prev, { role: "joris", text: toUserError(err), muted: true }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-violet-500/40 bg-gradient-to-br from-violet-500 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_50px_-20px_rgba(139,92,246,.9)] transition hover:opacity-95"
        aria-label="Ouvrir le chat Joris"
        data-testid="joris-dock-open"
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        Joris
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[20px] border border-violet-500/35 bg-gradient-to-b from-[#111528]/95 to-[#090c1a]/98 shadow-[0_30px_80px_-24px_rgba(0,0,0,.82)] backdrop-blur-xl"
      data-testid="joris-dock"
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="h-[30px] w-[30px] shrink-0 rounded-[10px] bg-[radial-gradient(circle_at_30%_30%,#22d3ee,#8b5cf6_70%)] shadow-[0_0_18px_rgba(139,92,246,.6)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#eff1fb]">Joris</p>
          <p className="text-[10.5px] font-semibold text-emerald-300">
            API Anthropic/OpenAI · abonnements CLI = mandat Yellow
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-[#98a1c4] transition hover:border-white/20 hover:text-white"
          aria-label="Réduire le chat Joris"
        >
          <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div ref={threadRef} className="flex max-h-[min(340px,45vh)] flex-col gap-2.5 overflow-auto px-4 py-3.5">
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <p
              key={i}
              className="max-w-[90%] self-end rounded-[13px] border border-violet-500/35 bg-gradient-to-br from-violet-500/26 to-indigo-500/[0.18] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#eff1fb]"
            >
              {turn.text}
            </p>
          ) : (
            <div key={i} className="flex max-w-[92%] flex-col gap-2 self-start">
              <p
                className={`rounded-[13px] border px-3 py-2.5 text-[12.5px] leading-relaxed ${
                  turn.muted
                    ? "border-amber-500/25 bg-amber-500/[0.06] text-amber-100"
                    : "border-white/10 bg-[#1c223a]/55 text-[#98a1c4]"
                }`}
              >
                {turn.muted ? (
                  <AlertCircle className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                ) : null}
                {turn.text}
              </p>
              {turn.requiresConfirmation ? (
                <Link
                  href="/hq#mission-draft-pending"
                  className="self-start rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200 transition hover:border-amber-400/50"
                >
                  Approuver le draft sur HQ →
                </Link>
              ) : null}
              {turn.href && !turn.requiresConfirmation ? (
                <Link
                  href={turn.href as Route}
                  className="self-start rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 transition hover:border-emerald-400/40"
                >
                  Voir le détail →
                </Link>
              ) : null}
            </div>
          ),
        )}
        {loading ? (
          <span className="inline-flex items-center gap-2 self-start text-[12px] text-[#646c8e]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Joris réfléchit…
          </span>
        ) : null}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-white/10 px-3.5 py-3">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Parle à Joris… (ex: book RDV demain 10h)"
          aria-label="Message pour Joris"
          className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-black/35 px-3 py-2.5 text-[12.5px] text-[#eff1fb] outline-none transition placeholder:text-[#646c8e] focus:border-violet-500/60"
        />
        <button
          type="submit"
          disabled={loading || !command.trim()}
          className="grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-gradient-to-br from-violet-500 to-indigo-500 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Envoyer"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
