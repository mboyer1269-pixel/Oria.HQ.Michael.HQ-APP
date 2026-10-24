"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EmployeeReadiness } from "@/features/employees/components/employee-readiness";
import { readEmployeesAction, saveEmployeeAction } from "@/features/employees/actions";
import type { EmployeeCommand, EmployeeFields, EmployeeListResult, EmployeeProfile, EmployeeScope } from "@/core/employees/types";

import { clearIntention, intentionStorageKey, isIntentionStale, readIntention, retainIntention, type CreateIntention } from "@/features/employees/create-intention";

const EMPTY: EmployeeFields = { displayName: "", specialty: "", instructions: "", assignmentRole: "", assignmentContext: "" };
const FIELDS = [
  ["displayName", "Nom d’affichage", 80],
  ["specialty", "Spécialité", 120],
  ["assignmentRole", "Rôle dans ce business", 120],
  ["instructions", "Mandat et limites", 4000],
  ["assignmentContext", "Contexte de l’affectation", 2000],
] as const;
const button = "min-h-11 rounded-xl border border-neutral-600 px-4 py-2 text-sm text-neutral-100 transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-50";

/** Directory only: an acknowledged write never means an employee can execute. */
type TeamProps = { ventureId: string; initial: EmployeeListResult; recoveryScope: Pick<EmployeeScope, "ownerId" | "workspaceId"> };
export function EmployeeTeam(props: TeamProps) {
  return <EmployeeTeamContent key={intentionStorageKey({ ...props.recoveryScope, ventureId: props.ventureId })} {...props} />;
}
function EmployeeTeamContent({ ventureId, initial, recoveryScope }: TeamProps) {
  const scope = { ...recoveryScope, ventureId };
  const intentionRef = useRef<CreateIntention | null>(null);
  const [intention, setIntention] = useState<CreateIntention | null>(null);
  const [staleIntention, setStaleIntention] = useState(false);
  const [confirmedCreation, setConfirmedCreation] = useState(false);
  const archiveFocus = useRef<string | null>(null);
  const cardHeadings = useRef(new Map<string, HTMLHeadingElement>());
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [result, setResult] = useState(initial);
  const [fields, setFields] = useState<EmployeeFields>(EMPTY);
  const [editing, setEditing] = useState<EmployeeProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const writing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<keyof EmployeeFields | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const formOpener = useRef<HTMLButtonElement | null>(null);
  const restoreFormFocus = useRef(false);
  const alive = useRef(true);
  const formId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    alive.current = true;
    // Restore only this authenticated presentation scope. No request is submitted.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const pending = readIntention(window.sessionStorage, { ownerId: recoveryScope.ownerId, workspaceId: recoveryScope.workspaceId, ventureId });
        if (pending) { intentionRef.current = pending; setIntention(pending); setStaleIntention(isIntentionStale(pending, Date.now())); setFields(pending.fields); setShowForm(true); }
        setRecoveryReady(true);
      } catch { setRecoveryError("Reprise locale indisponible. Aucune nouvelle création ne sera envoyée depuis cet onglet. Conservez cet onglet et vérifiez l’équipe avant toute nouvelle intention."); }
    });
    return () => { cancelled = true; alive.current = false; };
  }, [recoveryScope.ownerId, recoveryScope.workspaceId, ventureId]);
  useEffect(() => { if (showForm) nameInput.current?.focus(); }, [showForm, editing]);
  useEffect(() => {
    if (!showForm && restoreFormFocus.current) {
      restoreFormFocus.current = false;
      const target = formOpener.current?.isConnected ? formOpener.current : addButton.current;
      target?.focus();
    }
  }, [showForm]);
  useEffect(() => {
    const id = archiveFocus.current;
    if (id) { cardHeadings.current.get(id)?.focus(); archiveFocus.current = null; }
  }, [result]);
  const available = result.status === "ready";
  const employees = available ? result.employees : [];

  function closeForm() {
    restoreFormFocus.current = true;
    setShowForm(false);
    setInvalidField(null);
  }

  function open(employee: EmployeeProfile | null, opener: HTMLButtonElement) {
    formOpener.current = opener;
    setInvalidField(null);
    if (intention) {
      if (employee) return;
      setEditing(null); setFields(intention.fields); setShowForm(true); return;
    }
    setEditing(employee);
    setFields(employee ? { displayName: employee.displayName, specialty: employee.specialty, instructions: employee.instructions, assignmentRole: employee.assignmentRole, assignmentContext: employee.assignmentContext } : EMPTY);
    setArchiveId(null);
    setError("");
    setNotice("");
    setShowForm(true);
  }

  async function save(command: EmployeeCommand) {
    if (busy || writing.current || !available) return;
    if (command.operation === "create") {
      if (!recoveryReady || recoveryError) return;
      writing.current = true;
      try {
        const pending = intentionRef.current ?? { version: 1 as const, createdAt: Date.now(), creationKey: command.creationKey, fields: { displayName: command.displayName, specialty: command.specialty, instructions: command.instructions, assignmentRole: command.assignmentRole, assignmentContext: command.assignmentContext } };
        // A durable-to-this-tab recovery record is required BEFORE sending.
        retainIntention(window.sessionStorage, scope, pending);
        intentionRef.current = pending;
        setIntention(pending);
      } catch {
        writing.current = false;
        setRecoveryError("Reprise locale indisponible. Aucun nouvel envoi effectué. Ne recommencez pas avec une nouvelle intention avant de vérifier l’équipe.");
        return;
      }
    }
    writing.current = true;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await saveEmployeeAction(ventureId, command);
      if (!alive.current) return;
      if (response.status !== "saved") { setError(response.message); return; }
      if (command.operation === "archive") archiveFocus.current = response.employee.id;
      setResult((current) => current.status === "ready" ? { status: "ready", employees: [...current.employees.filter((row) => row.id !== response.employee.id), response.employee] } : current);
      if (command.operation === "create") {
        try { clearIntention(window.sessionStorage, scope); intentionRef.current = null; setIntention(null); setStaleIntention(false); setConfirmedCreation(false); }
        catch {
          setConfirmedCreation(true);
          setRecoveryError("Profil confirmé, mais la reprise locale n’a pas pu être effacée. Aucune nouvelle création n’est autorisée dans cet onglet pour le moment.");
          return;
        }
      }
      closeForm();
      setEditing(null);
      setFields(EMPTY);
      setArchiveId(null);
      setNotice(response.employee.state === "archived" ? "Profil archivé. Son identité et son affectation sont conservées." : "Profil enregistré. Aucun droit d’exécution n’a été accordé.");
    } catch {
      if (alive.current) setError("Enregistrement indisponible. Le résultat n’est pas confirmé. Rechargez l’équipe avant de réessayer ; votre saisie reste visible.");
    } finally { writing.current = false; if (alive.current) setBusy(false); }
  }

  function retryConfirmedCleanup() {
    if (!confirmedCreation || busy || writing.current) return;
    // Confirmation already came from the server in this scope. Only remove the
    // browser recovery record; never resubmit the creation to finish cleanup.
    try {
      clearIntention(window.sessionStorage, scope);
      intentionRef.current = null;
      setIntention(null); setStaleIntention(false); setConfirmedCreation(false);
      setRecoveryError(""); setError(""); setEditing(null); setFields(EMPTY);
      closeForm();
      setNotice("Profil déjà confirmé. Reprise locale nettoyée sans nouvel envoi.");
    } catch { setRecoveryError("Profil confirmé. Le nettoyage local reste indisponible ; aucune nouvelle création n’a été envoyée."); }
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await readEmployeesAction(ventureId);
      if (!alive.current) return;
      if (response.status !== "ready") { setError(response.message); return; }
      setResult(response);
      setNotice("Équipe relue depuis le stockage. La saisie ouverte n’a pas été envoyée.");
    } catch { if (alive.current) setError("Lecture indisponible. Les informations déjà affichées peuvent être périmées."); }
    finally { if (alive.current) setBusy(false); }
  }

  return <section className="space-y-5" aria-label="Mon équipe" aria-busy={busy}>
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-6 text-neutral-200">
      Ces profils sont proposés pour ce business uniquement. Ils ne disposent d’aucune licence, connexion, permission de lancement, session de navigateur ou terminal.
    </div>
    {!available && <p role="status" className="rounded-xl border border-neutral-700 p-4 text-sm text-neutral-200">{result.message} L’absence d’employés ne peut pas être confirmée.</p>}
    <div className="flex flex-wrap gap-3">
      <button ref={addButton} className={button} type="button" disabled={!available || busy || !recoveryReady || Boolean(recoveryError)} onClick={(event) => open(null, event.currentTarget)}>{intention ? "Reprendre la création" : "Ajouter un employé IA"}</button>
      <button className={button} type="button" disabled={busy} onClick={refresh}>Recharger l’équipe</button>
    </div>
    {recoveryError && <p role="alert" className="text-sm text-amber-200">{recoveryError}</p>}
    {confirmedCreation && <button className={button} type="button" disabled={busy} onClick={retryConfirmedCleanup}>Terminer le nettoyage local</button>}
    {staleIntention && <p role="status" className="text-sm text-amber-200">Cette intention date de plus de 24 heures. Vérifiez le business et reprenez explicitement la même clé et le même contenu. Aucun envoi automatique ni droit d’exécution n’est accordé.</p>}
    {intention && <p role="status" className="text-sm text-amber-200">Création en attente de confirmation : la même intention sera réutilisée. Les champs restent figés jusqu’à confirmation ; une relecture n’envoie rien. La reprise est conservée dans cet onglet uniquement.</p>}
    {notice && <p role="status" className="text-sm leading-6 text-emerald-300">{notice}</p>}
    {error && <p id={`${formId}-error`} role="alert" className="text-sm leading-6 text-amber-200">{error}</p>}
    {showForm && <form className="space-y-4 rounded-2xl border border-neutral-700 bg-neutral-950 p-5" onSubmit={(event) => {
      event.preventDefault();
      const clean = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.trim()])) as EmployeeFields;
      const invalid = FIELDS.find(([key, , max]) => {
        const controls = key === "instructions" || key === "assignmentContext"
          ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
        return !clean[key] || Array.from(clean[key]).length > max || controls.test(clean[key]);
      });
      if (invalid) {
        setInvalidField(invalid[0]);
        setError(`Le champ « ${invalid[1]} » est requis, doit respecter sa longueur maximale et ne doit pas contenir de caractères non autorisés.`);
        event.currentTarget.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${invalid[0]}"]`)?.focus();
        return;
      }
      setInvalidField(null);
      if (editing) { void save({ operation: "edit", id: editing.id, revision: editing.revision, ...clean }); return; }
      if (!recoveryReady || recoveryError) return;
      let creationKey: string;
      try { creationKey = intentionRef.current?.creationKey ?? crypto.randomUUID(); }
      catch { setError("Impossible de préparer une intention stable. Aucun envoi effectué."); return; }
      void save({ operation: "create", creationKey, ...(intentionRef.current?.fields ?? clean) });
    }}>
      <h2 className="text-lg font-semibold text-white">{editing ? "Modifier le profil" : "Ajouter un employé IA"}</h2>
      {editing && <p className="break-all text-xs text-neutral-400">Identité inchangée : {editing.id} · Révision {editing.revision}</p>}
      {FIELDS.map(([key, label, max]) => <div key={key}>
        <label className="mb-2 block text-sm text-neutral-200" htmlFor={`${formId}-${key}`}>{label} <span className="text-neutral-400">({Array.from(fields[key].trim()).length}/{max} caractères)</span></label>
        {key === "instructions" || key === "assignmentContext" ? <textarea id={`${formId}-${key}`} name={key} aria-invalid={invalidField === key || undefined} aria-describedby={invalidField === key ? `${formId}-error` : undefined} required rows={4} maxLength={2 * (max + 1)} value={fields[key]} disabled={busy || Boolean(intention)} onChange={(event) => { setFields({ ...fields, [key]: event.target.value }); if (invalidField === key) { setInvalidField(null); setError(""); } }} className="min-h-24 w-full rounded-xl border border-neutral-600 bg-neutral-900 p-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300" /> : <input ref={key === "displayName" ? nameInput : undefined} id={`${formId}-${key}`} name={key} aria-invalid={invalidField === key || undefined} aria-describedby={invalidField === key ? `${formId}-error` : undefined} required maxLength={2 * (max + 1)} value={fields[key]} disabled={busy || Boolean(intention)} onChange={(event) => { setFields({ ...fields, [key]: event.target.value }); if (invalidField === key) { setInvalidField(null); setError(""); } }} className="min-h-11 w-full rounded-xl border border-neutral-600 bg-neutral-900 p-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300" />}
      </div>)}
      <p className="text-xs leading-5 text-neutral-400">Le mandat décrit le travail souhaité. Il n’accorde aucun accès à des outils, connaissances privées ou autres business.</p>
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} type="submit">{busy ? "Enregistrement…" : staleIntention ? "Reprendre cette intention" : "Enregistrer le profil"}</button><button className={button} disabled={busy} type="button" onClick={() => { closeForm(); setError(""); }}>Annuler l’édition</button></div>
    </form>}
    {available && employees.length === 0 && <p className="text-sm text-neutral-300">Aucun employé enregistré pour ce business.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{employees.map((employee) => <article key={employee.id} className="min-w-0 space-y-3 rounded-2xl border border-neutral-700 bg-neutral-950 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 tabIndex={-1} ref={(node) => { if (node) cardHeadings.current.set(employee.id, node); else cardHeadings.current.delete(employee.id); }} className="break-words text-lg font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">{employee.displayName}</h2><span className="rounded-full border border-neutral-600 px-3 py-1 text-xs text-neutral-300">{employee.state === "archived" ? "Archivé" : "Proposé · non opérationnel"}</span></div>
      <p className="break-words text-sm text-neutral-300">{employee.specialty} · {employee.assignmentRole}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">{employee.instructions}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-400">{employee.assignmentContext}</p>
      <p className="break-all text-xs text-neutral-400">ID : {employee.id} · Révision {employee.revision}</p>
      <EmployeeReadiness employee={employee} />
      {employee.state === "draft" && <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy || Boolean(intention)} onClick={(event) => open(employee, event.currentTarget)}>Modifier {employee.displayName}</button><button type="button" className={button} disabled={busy} onClick={() => { setArchiveId(employee.id); setError(""); setNotice(""); }}>Archiver {employee.displayName}</button></div>}
      {archiveId === employee.id && <div className="space-y-3 rounded-xl border border-amber-500/30 p-3"><p className="text-sm text-neutral-200">Archiver ce profil sans supprimer son identité ni son affectation ?</p><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={() => void save({ operation: "archive", id: employee.id, revision: employee.revision })}>Confirmer l’archivage</button><button type="button" className={button} disabled={busy} onClick={() => setArchiveId(null)}>Conserver le profil</button></div></div>}
    </article>)}</div>
  </section>;
}
