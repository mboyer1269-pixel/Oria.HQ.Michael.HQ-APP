"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2, Send } from "lucide-react";

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
  requiresConfirmation?: boolean;
};

type Turn = { role: "user" | "joris"; text: string; muted?: boolean };

const SEED: Turn[] = [
  {
    role: "joris",
    text: "Bonjour Michael. Je propose, prépare et recommande; jamais d'exécution sans ton aval, un ledger et des bornes. Que veux-tu faire ?",
  },
];

function toUserError(error: unknown) {
  const message = error instanceof Error ? error.message : "Joris est temporairement indisponible.";
  if (/Joris API 401/.test(message)) {
    return "Joris nécessite une session active (Supabase) pour répondre. La fondation, elle, est déjà branchée sur le vrai signal.";
  }
  if (/Joris API \d+/.test(message)) {
    return "Joris ne répond pas pour le moment. Réessaie dans quelques instants.";
  }
  return message;
}

export function JorisDock() {
  const [turns, setTurns] = useState<Turn[]>(SEED);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);

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
      const data = (await response.json()) as ChatResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Joris API ${response.status}`);
      setTurns((prev) => [...prev, { role: "joris", text: data.summary }]);
    } catch (err) {
      setTurns((prev) => [...prev, { role: "joris", text: toUserError(err), muted: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 hidden w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[20px] border border-violet-500/35 bg-gradient-to-b from-[#111528]/95 to-[#090c1a]/98 shadow-[0_30px_80px_-24px_rgba(0,0,0,.82)] backdrop-blur-xl md:flex">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="h-[30px] w-[30px] shrink-0 rounded-[10px] bg-[radial-gradient(circle_at_30%_30%,#22d3ee,#8b5cf6_70%)] shadow-[0_0_18px_rgba(139,92,246,.6)]" />
        <div className="flex-1">
          <p className="text-sm font-bold text-[#eff1fb]">Joris</p>
          <p className="text-[10.5px] font-semibold text-emerald-300">chat owner-gated · propose seulement</p>
        </div>
      </div>

      <div className="flex max-h-[340px] flex-col gap-2.5 overflow-auto px-4 py-3.5">
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <p
              key={i}
              className="max-w-[90%] self-end rounded-[13px] border border-violet-500/35 bg-gradient-to-br from-violet-500/26 to-indigo-500/[0.18] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#eff1fb]"
            >
              {turn.text}
            </p>
          ) : (
            <p
              key={i}
              className={`max-w-[92%] self-start rounded-[13px] border px-3 py-2.5 text-[12.5px] leading-relaxed ${
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
          placeholder="Parle à Joris…"
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
