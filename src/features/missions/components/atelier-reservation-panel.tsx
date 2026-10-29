"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Mission } from "@/core/types";
import type { AtelierDevelopmentBinding } from "@/server/missions/atelier-development-contract";
import { atelierModelProposalKey, createAtelierReservationSession, initialAtelierReservationState, loadAtelierModelProposals,
  type AtelierModelProposal, type AtelierReservationResult } from "../atelier-reservation-session";

const button = "min-h-11 rounded-lg border border-[var(--fg-faint)] px-4 py-2 text-sm text-[var(--fg)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marigold)]";
const field = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--fg-faint)] bg-[var(--ink-900)] px-3 py-2 text-[var(--fg)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--marigold)]";
const heading = "Atelier — préparer une réservation, sans lancement";

/** Review the exact server binding, not a client-generated execution permission. */
export function AtelierReservationReview({ mission, binding }: { mission: Mission; binding: AtelierDevelopmentBinding }) {
  const development = mission.input.development as { scope?: unknown; acceptanceCriteria?: unknown } | undefined;
  return <section aria-label="Préparation Atelier à relire" className="mt-4 space-y-3 rounded-lg border border-[var(--border-strong)] p-4 text-sm">
    <h5 className="break-words font-semibold">{mission.title}</h5>
    <details><summary className={`${button} cursor-pointer`}>Objectif et critères de la mission</summary>
      <div className="mt-3 space-y-3">
        <p className="whitespace-pre-wrap break-words">{mission.objective}</p>
        {typeof development?.scope === "string" && <p className="whitespace-pre-wrap break-words"><strong>Périmètre :</strong> {development.scope}</p>}
        {typeof development?.acceptanceCriteria === "string" && <p className="whitespace-pre-wrap break-words"><strong>Critères d’acceptation :</strong> {development.acceptanceCriteria}</p>}
      </div>
    </details>
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0"><dt className="text-[var(--fg-muted)]">Dépôt relatif déclaré</dt><dd className="break-all">{binding.repository.relativePath}</dd></div>
      <div className="min-w-0"><dt className="text-[var(--fg-muted)]">Modèle proposé, non qualifié</dt><dd className="break-all">{binding.selection.runtimeId === "codex" ? "Codex" : "Claude Code"} · {binding.selection.modelId}</dd></div>
      <div><dt className="text-[var(--fg-muted)]">Durée demandée</dt><dd>{binding.limits.timeoutMs / 1000} secondes</dd></div>
      <div><dt className="text-[var(--fg-muted)]">Livrable demandé, pas encore produit</dt><dd>{binding.output}</dd></div>
      <div><dt className="text-[var(--fg-muted)]">Budget de mission enregistré</dt><dd>{binding.limits.missionCostBudgetCents === null ? "Non renseigné" : `${binding.limits.missionCostBudgetCents} centimes`}. Aucun débit autorisé ici.</dd></div>
    </dl>
    <p className="text-[var(--marigold)]">Réservation uniquement : ni approbation d’exécution, ni connexion qualifiée. Aucune dépense ni action externe autorisée.</p>
    <details><summary className={`${button} cursor-pointer`}>Informations techniques de la préparation</summary>
      <dl className="mt-3 space-y-3">
        <div><dt className="text-[var(--fg-muted)]">Commit déclaré, non vérifié</dt><dd className="break-all font-mono text-xs">{binding.repository.baseSha}</dd></div>
        <div><dt className="text-[var(--fg-muted)]">Révision du catalogue proposée</dt><dd className="break-all font-mono text-xs">{binding.selection.catalogRevision}</dd></div>
        <div><dt className="text-[var(--fg-muted)]">Profil d’instructions demandé</dt><dd>builder · spec.draft. Aucun agent assigné ou lancé. Une seule étape proposée.</dd></div>
      </dl>
      <p className="mt-2 break-all">Mission : {binding.missionId} · version : {binding.missionVersion}</p>
      <p className="mt-2 break-all font-mono text-xs">Empreinte de liaison reçue : {binding.bindingHash}</p>
    </details>
  </section>;
}

export function AtelierReservationOutcome({ result }: { result: AtelierReservationResult | null }) {
  if (!result) return null;
  if (result.kind === "prepared") return <p>Dossier prêt à relire. Aucune réservation ni approbation d’exécution enregistrée à cette étape.</p>;
  if (result.kind === "reserved") return <div className="space-y-2">
    <p>Réservation {result.source === "created" ? "enregistrée" : "retrouvée"}. Aucun agent lancé ; ce reçu n’est pas une approbation d’exécution.</p>
    <details><summary className={`${button} cursor-pointer`}>Référence de réservation</summary>
      <p className="mt-3 break-all font-mono text-xs">Référence : {result.claim.runId}</p>
      <p className="mt-2 text-[var(--fg-muted)]">Le runtime, le dépôt et le modèle restent à qualifier avant toute exécution distincte.</p>
    </details>
  </div>;
  return <p className={result.kind === "uncertain" ? "text-[var(--marigold)]" : "text-[var(--coral)]"}>{result.message}</p>;
}

export function AtelierReservationPanel({ mission, source }: { mission: Mission; source: "supabase" | "local" | "mock" }) {
  const development = mission.input.development as { version?: unknown; payloadHash?: unknown } | undefined;
  const payloadHash = typeof development?.payloadHash === "string" && /^[a-f0-9]{64}$/.test(development.payloadHash) ? development.payloadHash : null;
  const candidate = source === "supabase" && development?.version === 1 && payloadHash !== null;
  if (!candidate) return <section aria-label={heading} className="mt-5 rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--fg-muted)]">
    <h4 className="font-semibold text-[var(--fg)]">Préparation Atelier</h4>
    <p className="mt-3">Une mission de développement enregistrée durablement est nécessaire. Aucun agent lancé.</p>
  </section>;
  // A version/scope change retires every in-flight response. The scoped recovery hint survives a refresh.
  return <AtelierReservationInstance key={JSON.stringify([mission.workspaceId, mission.modeId, mission.id, mission.updatedAt])} mission={mission} payloadHash={payloadHash!} />;
}

function AtelierReservationInstance({ mission, payloadHash }: { mission: Mission; payloadHash: string }) {
  const formSummary = useRef<HTMLElement | null>(null);
  const reviewFocus = useRef<HTMLDivElement | null>(null);
  const focusAfterTransition = useRef<"form" | "review" | null>(null);
  const focusReviewAllowed = useRef(false);
  const [state, setState] = useState(initialAtelierReservationState);
  const [session] = useState(() => createAtelierReservationSession({
    scope: { workspaceId: mission.workspaceId, modeId: mission.modeId, missionId: mission.id, missionVersion: mission.updatedAt, developmentPayloadHash: payloadHash },
    storage: () => sessionStorage, changed: setState,
    existing: { present: Object.prototype.hasOwnProperty.call(mission.input, "_atelierRun"), claim: mission.input._atelierRun },
  }));
  const [options, setOptions] = useState<AtelierModelProposal[]>([]);
  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [catalogMessage, setCatalogMessage] = useState("");
  const [selection, setSelection] = useState("");
  const [draft, setDraft] = useState({ repository: "", baseSha: "", timeoutSeconds: "" });
  const [checked, setChecked] = useState(false);
  const catalogRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    session.activate();
    const timer = setTimeout(() => session.restore(), 0);
    return () => { clearTimeout(timer); session.dispose(); catalogRequest.current?.abort(); };
  }, [session]);

  async function loadOptions() {
    if (catalogRequest.current || state.busy) return;
    const controller = new AbortController(); catalogRequest.current = controller;
    setCatalogState("loading"); setCatalogMessage(""); setSelection("");
    try {
      const proposals = await loadAtelierModelProposals(mission.workspaceId, fetch, controller.signal);
      if (controller.signal.aborted) return;
      setOptions(proposals); setCatalogState("loaded");
    } catch (error) {
      if (controller.signal.aborted) return;
      setOptions([]); setCatalogState("error");
      setCatalogMessage(error instanceof Error && error.message === "unauthenticated" ? "Session expirée. Reconnectez-vous pour lire les propositions de modèles."
        : "Catalogue abonnement indisponible ou accès refusé. Aucune proposition de modèle n’a été retenue.");
    } finally { if (catalogRequest.current === controller) catalogRequest.current = null; }
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setChecked(false);
    const option = options.find(candidate => atelierModelProposalKey(candidate) === selection);
    if (!option || catalogState !== "loaded") return;
    const form = new FormData(event.currentTarget);
    const values = { repository: String(form.get("repository") ?? "").trim(), baseSha: String(form.get("baseSha") ?? "").trim(), timeoutSeconds: String(form.get("timeoutSeconds") ?? "") };
    setDraft(values);
    focusAfterTransition.current = "review";
    const submittedForm = event.currentTarget;
    focusReviewAllowed.current = submittedForm.contains(document.activeElement);
    // Follow the initiating focus, unless the user navigates/clicks elsewhere while waiting.
    const movedOutside = (event: Event) => {
      if (event.target instanceof Node && !submittedForm.contains(event.target)) focusReviewAllowed.current = false;
    };
    document.addEventListener("focusin", movedOutside);
    document.addEventListener("pointerdown", movedOutside, true);
    try {
      await session.prepare({ missionId: mission.id, repository: { relativePath: values.repository, baseSha: values.baseSha },
        selection: { runtimeId: option.runtimeId, modelId: option.modelId, catalogRevision: option.catalogRevision }, timeoutMs: Number(values.timeoutSeconds) * 1000 });
    } finally {
      document.removeEventListener("focusin", movedOutside);
      document.removeEventListener("pointerdown", movedOutside, true);
    }
  }
  const canEdit = state.ready && !state.storageError && !state.pending && !state.prepared && state.result?.kind !== "reserved";
  useEffect(() => {
    if (state.busy) return;
    if (focusAfterTransition.current === "form" && canEdit && formSummary.current) {
      formSummary.current.focus(); focusAfterTransition.current = null;
    } else if (focusAfterTransition.current === "review" && state.prepared && reviewFocus.current) {
      // Only follow the submitted form when the user has not moved focus elsewhere.
      if (focusReviewAllowed.current) reviewFocus.current.focus();
      focusAfterTransition.current = null;
    } else if (focusAfterTransition.current === "review" && canEdit) {
      focusAfterTransition.current = null;
    }
  }, [canEdit, state.busy, state.prepared]);
  const stage = state.pending ? "Réservation à vérifier" : state.prepared ? "Paramètres à relire"
    : state.result?.kind === "reserved" ? "Réservation confirmée" : state.storageError || state.result?.kind === "blocked" ? "À vérifier"
      : catalogState === "error" || (catalogState === "loaded" && options.length === 0) ? "Catalogue à vérifier" : "À préparer";
  return <section aria-label={heading} className="mt-5 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--ink-950)] p-4 text-sm text-[var(--fg)]" aria-busy={state.busy}>
    <h4 className="font-semibold">Préparation Atelier</h4>
    <p className="mt-1 text-xs text-[var(--fg-muted)]">{stage} · sans lancement d’agent</p>
    <p className="mt-3 text-[var(--fg-muted)]">Réserver n’autorise ni exécution, ni dépense, ni action externe.</p>
    {!state.ready && <p role="status" className="mt-3">Lecture du suivi de réservation de cet onglet…</p>}
    {catalogState === "loaded" && options.length === 0 && <p role="status" className="mt-3">Aucun modèle abonnement proposé pour cette session. Aucun repli API.</p>}
    {catalogMessage && <p role="alert" className="mt-3 text-[var(--coral)]">{catalogMessage}</p>}
    {canEdit && <details className="mt-4"><summary ref={formSummary} className={`${button} cursor-pointer`}>Préparer une réservation</summary>
    <form onSubmit={event => void prepare(event)} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="min-w-0 sm:col-span-2">Dépôt relatif dans l’espace Atelier
        <input required name="repository" maxLength={600} defaultValue={draft.repository} placeholder="projet/application" autoComplete="off" disabled={state.busy} className={field} />
      </label>
      <label className="min-w-0 sm:col-span-2">Commit de base complet
        <input required name="baseSha" minLength={40} maxLength={64} defaultValue={draft.baseSha} pattern="(?:[a-f0-9]{40}|[a-f0-9]{64})" autoComplete="off" spellCheck={false} disabled={state.busy} className={field} />
        <span className="mt-1 block text-xs text-[var(--fg-muted)]">40 ou 64 caractères hexadécimaux minuscules.</span>
      </label>
      <div className="sm:col-span-2">
        <button type="button" className={button} disabled={state.busy || catalogState === "loading"} onClick={() => void loadOptions()}>{catalogState === "loading" ? "Lecture du catalogue…" : "Lire les propositions de modèles"}</button>
      </div>
      <label className="min-w-0 sm:col-span-2">Modèle proposé, non qualifié
        <select value={selection} onChange={event => setSelection(event.target.value)} required disabled={state.busy || catalogState !== "loaded" || options.length === 0} className={field}>
          <option value="">Aucun modèle sélectionné</option>
          {options.map(option => <option key={atelierModelProposalKey(option)} value={atelierModelProposalKey(option)}>{option.runtimeId === "codex" ? "Codex" : "Claude Code"} · {option.modelId} · proposition non qualifiée{!option.executable ? " / runtime désactivé" : ""}</option>)}
        </select>
      </label>
      <label>Durée demandée (1 à 900 secondes)
        <input required type="number" name="timeoutSeconds" min={1} max={900} step={1} defaultValue={draft.timeoutSeconds} disabled={state.busy} className={field} />
      </label>
      <button className={`${button} sm:col-span-2`} disabled={state.busy || !selection || catalogState !== "loaded"}>Préparer le dossier à relire</button>
    </form></details>}
    {state.prepared && <>
      <div ref={reviewFocus} tabIndex={-1} aria-label="Paramètres de réservation à relire" className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marigold)]">
      <AtelierReservationReview mission={mission} binding={state.prepared.binding} />
      </div>
      <label className="mt-4 flex min-h-11 items-start gap-3 py-2">
        <input type="checkbox" checked={checked} disabled={state.busy} onChange={event => setChecked(event.target.checked)} className="mt-1" />
        Je confirme uniquement ces paramètres de réservation. Je n’autorise aucune exécution.
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" disabled={state.busy || !checked} className={button} onClick={() => { const confirmed = checked; setChecked(false); void session.reserve(confirmed); }}>Réserver cette préparation — sans lancer</button>
        <button type="button" disabled={state.busy} className={button} onClick={() => { focusAfterTransition.current = "form"; setChecked(false); session.edit(); }}>Modifier avant réservation</button>
      </div>
    </>}
    {state.pending && <div className="mt-4 space-y-3">
      <p className="text-[var(--marigold)]">Paramètres figés. Relisez le reçu sans envoyer une nouvelle réservation.</p>
      <button type="button" disabled={state.busy} className={button} onClick={() => void session.reconcile()}>Vérifier la réservation — sans renvoyer</button>
    </div>}
    <div role="status" aria-live="polite" className="mt-4">{state.busy ? "Vérification en cours…" : <AtelierReservationOutcome result={state.result} />}</div>
    {state.storageError && state.result?.kind === "reserved" && <p role="alert" className="mt-2 text-[var(--marigold)]">Le reçu est confirmé, mais son suivi local n’a pas pu être nettoyé. Gardez sa référence ; aucune nouvelle réservation.</p>}
    <details className="mt-4 text-xs text-[var(--fg-muted)]"><summary className="min-h-11 cursor-pointer rounded-lg py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marigold)]">Fonctionnement et suivi local</summary>
      <p className="leading-5">Les modèles sont proposés, pas connectés ni qualifiés. Cet onglet conserve seulement les paramètres et l’empreinte nécessaires à une relecture après envoi, par projet, mode et mission. Aucun contenu de mission ni secret n’est stocké ici. Le serveur reste l’autorité ; le reçu local n’accorde aucun pouvoir.</p>
    </details>
  </section>;
}
