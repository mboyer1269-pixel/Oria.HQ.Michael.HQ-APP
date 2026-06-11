"use client";

// Send Desk queue — `ceo_single_send` review + dispatch surface.
//
// One card per prepared action. The CEO reviews the full rendered message,
// then sends with an explicit two-step confirmation. Every send returns a
// ledger event id displayed on the card — the proof is part of the UI.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  MessageSquareText,
  SendHorizonal,
  ShieldCheck,
  XCircle,
} from "lucide-react";

export type SendDeskItem = {
  actionId: string;
  approvalToken: string;
  channelId: "email" | "sms";
  recipient: string;
  subject: string;
  body: string;
  subVoie: string;
  audienceType: string;
  consentBasis: string;
  ventureId?: string;
  status: "queued" | "sent" | "failed" | "blocked";
  providerMessageId?: string;
  ledgerEventId?: string;
  sentAt?: string;
  blockReason?: string;
};

type SendState =
  | { phase: "idle" }
  | { phase: "confirming" }
  | { phase: "sending" }
  | { phase: "sent"; ledgerEventId: string; sentAt: string; alreadySent: boolean }
  | { phase: "blocked"; reason: string }
  | { phase: "failed"; errorCode: string; retryable: boolean };

const CHANNEL_META = {
  email: { label: "Email", icon: Mail, chip: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  sms: {
    label: "SMS",
    icon: MessageSquareText,
    chip: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
} as const;

const SUB_VOIE_LABEL: Record<string, string> = {
  reply_assist: "Réponse à un lead",
  follow_up: "Relance",
  re_activation: "Réactivation",
  cold_email: "Prospection",
};

function StatusChip({ item, sendState }: { item: SendDeskItem; sendState: SendState }) {
  if (sendState.phase === "sent" || item.status === "sent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Envoyé
      </span>
    );
  }
  if (sendState.phase === "failed" || item.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
        <XCircle className="h-3.5 w-3.5" />
        Échec
      </span>
    );
  }
  if (sendState.phase === "blocked" || item.status === "blocked") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        Bloqué
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
      <ShieldCheck className="h-3.5 w-3.5" />
      Prêt — attend ton clic
    </span>
  );
}

function SendDeskCard({ item }: { item: SendDeskItem }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [sendState, setSendState] = useState<SendState>({ phase: "idle" });
  const [isPending, startTransition] = useTransition();

  const channel = CHANNEL_META[item.channelId];
  const ChannelIcon = channel.icon;
  const isFinal = item.status === "sent" || sendState.phase === "sent";

  async function dispatch() {
    setSendState({ phase: "sending" });
    try {
      const response = await fetch("/api/outbound/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: item.actionId, approvalToken: item.approvalToken }),
      });
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.status === "sent") {
        setSendState({
          phase: "sent",
          ledgerEventId: payload.ledgerEventId,
          sentAt: payload.sentAt,
          alreadySent: Boolean(payload.alreadySent),
        });
        startTransition(() => router.refresh());
        return;
      }
      if (response.status === 422 && payload?.status === "blocked") {
        setSendState({ phase: "blocked", reason: payload.blockReason ?? "Bloqué par la policy." });
        return;
      }
      if (payload?.status === "failed") {
        setSendState({
          phase: "failed",
          errorCode: payload.errorCode ?? "unknown",
          retryable: Boolean(payload.retryable),
        });
        return;
      }
      setSendState({
        phase: "failed",
        errorCode: payload?.error ?? `http_${response.status}`,
        retryable: false,
      });
    } catch {
      setSendState({ phase: "failed", errorCode: "network_error", retryable: true });
    }
  }

  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 transition hover:border-neutral-700 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${channel.chip}`}
            >
              <ChannelIcon className="h-3.5 w-3.5" />
              {channel.label}
            </span>
            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-0.5 text-xs text-neutral-400">
              {SUB_VOIE_LABEL[item.subVoie] ?? item.subVoie}
            </span>
            <StatusChip item={item} sendState={sendState} />
          </div>
          <h3 className="mt-2 truncate text-sm font-bold text-white sm:text-base">
            {item.subject}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            À : <span className="text-neutral-300">{item.recipient}</span>
            {item.ventureId ? <span className="ml-2 text-neutral-600">· {item.ventureId}</span> : null}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Réduire" : "Réviser le message"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Message complet — c&apos;est exactement ce qui partira
          </p>
          <p className="mt-2 text-sm font-semibold text-neutral-200">{item.subject}</p>
          <pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-neutral-300">
            {item.body}
          </pre>
          <p className="mt-3 border-t border-neutral-800 pt-2 text-xs text-neutral-600">
            Consentement : {item.consentBasis} · Audience : {item.audienceType} · Le contenu est
            verrouillé par hash — toute modification invalide l&apos;approbation.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-neutral-500">
          {sendState.phase === "sent" ? (
            <span className="text-emerald-400">
              {sendState.alreadySent ? "Déjà envoyé (clic dédupliqué). " : "Envoyé. "}
              Preuve ledger : <code className="text-emerald-300">{sendState.ledgerEventId}</code>
            </span>
          ) : item.status === "sent" && item.ledgerEventId ? (
            <span className="text-emerald-400">
              Preuve ledger : <code className="text-emerald-300">{item.ledgerEventId}</code>
              {item.sentAt ? ` · ${new Date(item.sentAt).toLocaleString("fr-CA")}` : ""}
            </span>
          ) : sendState.phase === "blocked" ? (
            <span className="text-rose-400">{sendState.reason}</span>
          ) : sendState.phase === "failed" ? (
            <span className="text-rose-400">
              Échec ({sendState.errorCode}){sendState.retryable ? " — réessayable" : ""}
            </span>
          ) : item.status === "blocked" && item.blockReason ? (
            <span className="text-rose-400">{item.blockReason}</span>
          ) : (
            <span>Un clic = un envoi = une preuve au ledger.</span>
          )}
        </div>

        {!isFinal ? (
          sendState.phase === "confirming" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSendState({ phase: "idle" })}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:border-neutral-500"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={dispatch}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500"
              >
                <SendHorizonal className="h-3.5 w-3.5" />
                Confirmer l&apos;envoi à {item.recipient}
              </button>
            </div>
          ) : sendState.phase === "sending" || isPending ? (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-xs font-bold text-neutral-400"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Envoi en cours…
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSendState({ phase: "confirming" })}
              disabled={sendState.phase === "failed" && !sendState.retryable}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendHorizonal className="h-3.5 w-3.5" />
              {sendState.phase === "failed" ? "Réessayer" : "Envoyer"}
            </button>
          )
        ) : null}
      </div>
    </article>
  );
}

export function SendDeskQueue({ items }: { items: SendDeskItem[] }) {
  const { pending, done } = useMemo(() => {
    return {
      pending: items.filter((item) => item.status === "queued" || item.status === "blocked"),
      done: items.filter((item) => item.status === "sent" || item.status === "failed"),
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 p-8 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-neutral-700" />
        <p className="mt-3 text-sm font-semibold text-neutral-300">La file est vide.</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-neutral-500">
          Hermès (ou toi, via <code className="text-neutral-400">POST /api/outbound/queue</code>)
          dépose ici les messages prêts. Rien ne part jamais sans ton clic.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 ? (
        <div className="flex flex-col gap-3">
          {pending.map((item) => (
            <SendDeskCard key={item.actionId} item={item} />
          ))}
        </div>
      ) : null}
      {done.length > 0 ? (
        <details className="group" open={pending.length === 0}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:text-neutral-300">
            Historique ({done.length})
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {done.map((item) => (
              <SendDeskCard key={item.actionId} item={item} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
