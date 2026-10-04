"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { developmentHandoffKey, encodeDevelopmentHandoff, missionDossierHref } from "@/features/missions/development-mission-handoff";
import { clearSentChatInputDraft, readChatInputDraft, saveChatInputDraft, type ChatInputDraft } from "../chat-input-draft";
import type { ChatExecutionReport } from "@/server/joris/chat-model-binding";
import {
  AlertCircle,
  Bell,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Download,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ActionLedgerStatus, CalendarEvent, MissionDraftPreview } from "@/features/hq/types";
import {
  formatMissionDraftExpiryLabel,
  formatMissionDraftSchedule,
  MISSION_DRAFT_CHANGED_EVENT,
} from "@/features/hq/mission-draft-format";

type ChatResponse = {
  chatExecution?: ChatExecutionReport;
  chatBindingStatus?: string;
  summary: string;
  intent?: string;
  modelId?: string;
  costMode?: string;
  calendarEvent?: CalendarEvent;
  ledgerStatus?: ActionLedgerStatus;
  storageMode?: string;
  requiresConfirmation?: boolean;
  missionDraftPreview?: MissionDraftPreview;
  auditExport?: {
    filename: string;
    mimeType: "text/csv";
    content: string;
    totalDecisions: number;
    humanOnTheLoop?: true;
    noExecutionAuthorized?: true;
  };
  pendingDraftId?: string;
  missionId?: string;
  missionPlanResult?: { missionId?: unknown };
};

type ErrorResponse = {
  error?: string;
};
type ChatModelOption={accountId:string;modelId:string;catalogRevision:string;provider:string;billingKind:string;executable:boolean;reason:string|null};
const modelOptionKey=(option:ChatModelOption)=>JSON.stringify([option.accountId,option.modelId,option.catalogRevision]);

function formatReminderLabel(remindersMinutes: number[]) {
  return remindersMinutes.map((minutes) => `${minutes} min`).join(" + ");
}

function formatStorageLabel(storageMode?: string) {
  if (storageMode === "supabase") return "Base privée";
  if (storageMode === "local") return "Session locale";

  return storageMode;
}

function formatLedgerLabel(status: ActionLedgerStatus) {
  return status === "recorded" ? "Action journalisée" : "Journal à vérifier";
}

function toUserError(error: unknown) {
  const message = error instanceof Error ? error.message : "Joris est temporairement indisponible.";

  if (/Joris API \d+/.test(message)) {
    return "Joris ne répond pas pour le moment. Réessaie dans quelques instants.";
  }

  return message;
}

function notifyMissionDraftChanged(data: ChatResponse) {
  if (data.intent === "mission.draft" || data.missionDraftPreview || data.pendingDraftId) {
    window.dispatchEvent(new CustomEvent(MISSION_DRAFT_CHANGED_EVENT));
  }

  if (data.intent === "calendar.book" && data.calendarEvent) {
    window.dispatchEvent(new CustomEvent(MISSION_DRAFT_CHANGED_EVENT));
  }
}

function downloadAuditExport(auditExport: NonNullable<ChatResponse["auditExport"]>) {
  const blob = new Blob([auditExport.content], { type: auditExport.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = auditExport.filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const commandExamples = [
  "Prépare un plan de mission pour améliorer les tests de mon application",
  "Résume le contexte disponible et indique ce qui reste à vérifier",
];

function MissionDraftProposalHint({ preview }: { preview: MissionDraftPreview }) {
  const schedule = formatMissionDraftSchedule(preview);
  const expiryLabel = formatMissionDraftExpiryLabel(undefined, preview.expiresAt);

  return (
    <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Proposition en attente</p>
          <p className="mt-1 font-medium text-white">{preview.title}</p>
          {schedule ? <p className="mt-1 text-sm text-amber-100">{schedule}</p> : null}
          <p className="mt-2 text-xs text-neutral-500">{expiryLabel}</p>
          <Link
            href="#mission-draft-pending"
            className="mt-3 inline-flex text-sm font-semibold text-amber-300 underline-offset-2 hover:underline"
          >
            Approuver ou refuser dans le bandeau Mission draft
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CommandCenter({ workspaceId }: { workspaceId: string }) {
  return <CommandCenterInstance key={workspaceId} workspaceId={workspaceId} />;
}

function CommandCenterInstance({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [command, setCommand] = useState("");
  const draftRef = useRef<ChatInputDraft | null>(null);
  const sending = useRef(false);
  const generation = useRef(0);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [modelOptions,setModelOptions]=useState<ChatModelOption[]>([]);
  const [modelSelection,setModelSelection]=useState("");
  const [modelsLoaded,setModelsLoaded]=useState(false);
  const [submittedCommand, setSubmittedCommand] = useState("");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preparationText = command.trim() || submittedCommand;
  const dossierHref = missionDossierHref(result?.missionPlanResult?.missionId);

  useEffect(()=>{
    const controller=new AbortController();
    void fetch("/api/joris/chat",{cache:"no-store",signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error("unavailable");
      const data=await response.json();
      if(!Array.isArray(data.options))throw Error("invalid");
      if(!controller.signal.aborted){setModelOptions(data.options);setModelsLoaded(true);}
    }).catch(()=>{if(!controller.signal.aborted){setModelOptions([]);setModelsLoaded(true);}});
    return ()=>controller.abort();
  },[workspaceId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (draftRef.current || sending.current) return;
      try {
        const stored = readChatInputDraft(sessionStorage, workspaceId);
        if (stored.status === "ready") {
          draftRef.current = stored.draft;
          setCommand(stored.draft.text);
        } else if (stored.status === "unavailable") setDraftNotice("Conservation de la saisie indisponible dans cet onglet.");
      } catch { setDraftNotice("Conservation de la saisie indisponible dans cet onglet."); }
    }, 0);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [workspaceId]);

  function editCommand(text: string) {
    const draft = { id: crypto.randomUUID(), text };
    draftRef.current = draft;
    setCommand(text);
    try {
      setDraftNotice(saveChatInputDraft(sessionStorage, workspaceId, draft) ? null : "Conservation de la saisie indisponible. Garde cet écran ouvert pour ne pas la perdre.");
    } catch { setDraftNotice("Conservation de la saisie indisponible. Garde cet écran ouvert pour ne pas la perdre."); }
  }

  function prepareDevelopmentMission() {
    const encoded = encodeDevelopmentHandoff(workspaceId, preparationText);
    if (!encoded) return;
    try {
      sessionStorage.setItem(developmentHandoffKey(workspaceId), encoded);
      setHandoffError(null);
      router.push("/hq/missions#development-mission");
    } catch {
      setHandoffError("Le transfert de cette session est indisponible. Copie ton objectif dans le formulaire Missions.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = command.trim();
    if (!text || sending.current) return;
    const sentDraft = draftRef.current;
    const ticket = generation.current;
    sending.current = true;

    setLoading(true);
    setError(null);
    setResult(null);
    setSubmittedCommand(text);

    try {
      const response = await fetch("/api/joris/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, locale: "fr-CA", ...(()=>{
          const selected=modelOptions.find(option=>option.executable&&modelOptionKey(option)===modelSelection);
          return selected?{modelSelection:{accountId:selected.accountId,modelId:selected.modelId,catalogRevision:selected.catalogRevision}}:{};
        })() }),
      });

      const data = (await response.json()) as ChatResponse & ErrorResponse;

      if (!response.ok) {
        throw new Error(data.error ?? `Joris API ${response.status}`);
      }

      if (typeof data.summary !== "string") throw new Error("La réponse reçue est illisible. Ta saisie est conservée.");
      let cleared = true;
      if (sentDraft) {
        try { cleared = clearSentChatInputDraft(sessionStorage, workspaceId, sentDraft.id); }
        catch { cleared = false; }
      }
      if (ticket !== generation.current) return;

      setResult(data);
      notifyMissionDraftChanged(data);
      if (data.calendarEvent) {
        window.dispatchEvent(new CustomEvent("michael-hq:calendar-changed"));
      }
      if (draftRef.current?.id === sentDraft?.id) {
        draftRef.current = null;
        setCommand("");
      }
      if (!cleared) setDraftNotice("Message envoyé, mais la copie locale de la saisie n’a pas pu être effacée. Elle peut réapparaître au retour.");
    } catch (err) {
      if (ticket === generation.current) setError(toUserError(err));
    } finally {
      sending.current = false;
      if (ticket === generation.current) setLoading(false);
    }
  }

  return (
    <section
      id="command-center"
      data-testid="command-center"
      aria-busy={loading}
      className="rounded-3xl border border-amber-500/30 bg-neutral-950/85 p-4 shadow-2xl shadow-amber-950/20 md:p-6"
    >
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-400">Command Center</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Parler à Joris</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
            Décris ton objectif et le résultat attendu. Joris peut préparer une réponse ou une proposition ; cela ne lance pas automatiquement une équipe d’agents.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Permissions actives
        </div>
      </div>

      <label className="mb-3 block text-sm text-neutral-300">Compte et modèle pour la réponse IA
        <select value={modelSelection} onChange={event=>setModelSelection(event.target.value)} disabled={loading||!modelOptions.some(option=>option.executable)} className="mt-2 min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-white disabled:opacity-60">
          <option value="">Sans appel IA — commandes déterministes disponibles</option>
          {modelOptions.map(option=><option key={modelOptionKey(option)} value={modelOptionKey(option)} disabled={!option.executable}>{option.provider} · {option.modelId} · compte {option.accountId}{option.executable?"":` — indisponible (${option.reason})`}</option>)}
        </select>
      </label>
      <p className="mb-3 text-xs text-neutral-400">{!modelsLoaded?"Lecture des qualifications serveur…":!modelOptions.some(option=>option.executable)?"Aucun accès compte/modèle admissible pour ce chat. Les commandes calendrier et missions restent disponibles.":"Choisis explicitement un accès qualifié. Le serveur revérifie le compte, le modèle, la révision et le budget à l’envoi. Aucun repli payant automatique."} Les quotas disponibles ne sont pas mesurés ici.</p>
      <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row">
        <div className="flex min-h-14 flex-1 items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 transition focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/10">
          <MessageSquare aria-hidden="true" className="h-5 w-5 shrink-0 text-neutral-500" />
          <input
            maxLength={4000}
            value={command}
            onChange={(event) => editCommand(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-neutral-600"
            placeholder="Quel résultat veux-tu obtenir pour ton projet ?"
            aria-label="Commande pour Joris"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !command.trim()}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 font-semibold text-neutral-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 md:w-auto"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {loading ? "Joris traite..." : "Envoyer"}
        </button>
      </form>
      <p className="mt-2 text-xs text-neutral-500">La saisie non envoyée reste dans cet onglet, par projet, pendant 24 heures après modification. Elle n’est jamais envoyée automatiquement.</p>
      {draftNotice && <p role="status" className="mt-2 text-sm text-amber-200">{draftNotice}</p>}

      <button type="button" disabled={loading || !preparationText || preparationText.length > 4000} onClick={prepareDevelopmentMission}
        className="mt-3 min-h-11 rounded-lg border border-amber-500/40 px-4 text-sm font-semibold text-amber-200 disabled:opacity-50">Préparer une mission de développement</button>
      <p className="mt-2 text-xs text-neutral-400">Transfère ton texte vers l’objectif du formulaire dans cet onglet ; ce transfert expire après 15 minutes. Complète ensuite le titre, le périmètre et les critères avant d’enregistrer.</p>
      {handoffError && <p role="alert" className="mt-2 text-sm text-amber-200">{handoffError} <Link href="/hq/missions#development-mission" className="underline">Ouvrir le formulaire</Link></p>}

      <p className="mt-3 text-xs leading-5 text-neutral-400">Une réponse IA exige un compte et un modèle qualifiés. Les abonnements CLI ne sont pas automatiquement utilisés. Le modèle exécuté et les tokens sont affichés lorsqu’ils sont fournis ; le coût reste inconnu sans mesure.</p>

      {!result && !error && (
        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Partir d’un exemple</p>
              <p className="mt-1 text-sm leading-6 text-neutral-400">
                Un clic remplit le champ. Tu peux modifier la demande avant de l’envoyer.
              </p>
            </div>
            <span className="w-fit rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
              Aucun résultat encore
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {commandExamples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => editCommand(example)}
                className="group inline-flex min-h-10 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 text-left text-sm text-neutral-300 transition hover:border-amber-500/40 hover:bg-amber-500/5 hover:text-amber-200"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-neutral-500 transition group-hover:text-amber-400" />
                <span>{example}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div
          className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <div>
              <p className="text-sm font-semibold text-white">Réponse de Joris</p>
              <p className="mt-1 text-sm leading-6 text-neutral-300">{result.summary}</p>
            </div>
          </div>

          {result.missionDraftPreview && result.requiresConfirmation ? (
            <MissionDraftProposalHint preview={result.missionDraftPreview} />
          ) : null}

          {dossierHref && <Link href={dossierHref} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-amber-200 underline">Ouvrir le dossier de cette mission</Link>}
          {result.chatBindingStatus&&<p className="mt-3 text-sm text-amber-200">Réponse IA non disponible : {result.chatBindingStatus}. Aucun autre compte ou modèle n’a été choisi automatiquement.</p>}
          {result.chatExecution&&<dl className="mt-3 grid gap-2 text-xs text-neutral-300 sm:grid-cols-2">
            <div><dt>Compte demandé</dt><dd className="break-all">{result.chatExecution.accountId??"Non lié"}</dd></div>
            <div><dt>Modèle demandé</dt><dd>{result.chatExecution.requestedModelId??"Inconnu"}</dd></div>
            <div><dt>Modèle rapporté par le fournisseur</dt><dd>{result.chatExecution.executedModelId??"Non observé"}</dd></div>
            <div><dt>Tokens observés (entrée / sortie)</dt><dd>{result.chatExecution.usage?`${result.chatExecution.usage.input} / ${result.chatExecution.usage.output}`:"Non disponibles"}</dd></div>
            <div><dt>Coût monétaire observé</dt><dd>Non disponible</dd></div>
            <div><dt>Réservation budget</dt><dd>{result.chatExecution.reservationStatus}</dd></div>
          </dl>}

          {result.auditExport ? (
            <button
              type="button"
              onClick={() => downloadAuditExport(result.auditExport!)}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/50 hover:bg-emerald-500/15"
            >
              <Download className="h-4 w-4" />
              Télécharger le rapport d&apos;audit (CSV, lecture seule)
            </button>
          ) : null}

          {result.calendarEvent && (
            <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <CalendarCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                      {result.missionId ? "Calendrier confirmé" : "Rendez-vous booké"}
                    </p>
                    <p className="mt-1 font-medium text-white">{result.calendarEvent.title}</p>
                    <p className="mt-1 text-sm text-neutral-300">Ajouté à l&apos;agenda du workspace Michael HQ.</p>
                    {result.missionId ? (
                      <p className="mt-2 font-mono text-xs text-emerald-200/90">missionId: {result.missionId}</p>
                    ) : null}
                  </div>
                </div>
                <span className="w-fit rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                  Confirmé
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Date</p>
                  <p className="mt-1 text-sm font-medium text-white">{result.calendarEvent.dateISO}</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Heure</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {result.calendarEvent.startTime} à {result.calendarEvent.endTime}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Rappels</p>
                  <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-white">
                    <Bell className="h-3.5 w-3.5 text-amber-300" />
                    {formatReminderLabel(result.calendarEvent.remindersMinutes)}
                  </p>
                </div>
              </div>

              {result.missionId ? (
                <Link
                  href="#ledger-activity"
                  className="mt-4 inline-flex text-sm font-semibold text-emerald-300 underline-offset-2 hover:underline"
                >
                  Voir la trace ledger (Liée)
                </Link>
              ) : null}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
            {result.modelId && <span>Modèle de routage : {result.modelId}</span>}
            {result.costMode && <span>Mode: {result.costMode}</span>}
            {result.storageMode && <span>Stockage: {formatStorageLabel(result.storageMode)}</span>}
            {result.ledgerStatus && (
              <span className={result.ledgerStatus === "recorded" ? "text-emerald-300" : "text-amber-300"}>
                {formatLedgerLabel(result.ledgerStatus)}
              </span>
            )}
            {result.requiresConfirmation && !result.missionDraftPreview ? (
              <span className="text-amber-300">Confirmation requise</span>
            ) : null}
          </div>
        </div>
      )}

      {error && (
        <div
          className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium text-red-100">Joris n&apos;a pas pu compléter ça.</p>
            <p className="mt-1 leading-6">{error}</p>
          </div>
        </div>
      )}
    </section>
  );
}
