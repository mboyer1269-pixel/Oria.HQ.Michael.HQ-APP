import type { ArtifactKind, MissionStatus, RuntimeId, StepKind, StepStatus, missionView } from "@/server/atelier/atelier-mission";

type MissionView = ReturnType<typeof missionView>;
const RUNTIME_NAME: Record<RuntimeId, string> = { codex: "Codex", "claude-code": "Claude Code" };

const MISSION_STATUS: Record<MissionStatus, string> = {
  created: "Créée", running: "En cours — activité non confirmée", interrupted: "Interrompue",
  awaiting_review: "À relire", failed: "Échec", blocked: "Bloquée", needs_human_review: "Revue humaine requise",
};
const STEP_STATUS: Record<StepStatus, string> = {
  running: "En cours — activité non confirmée", succeeded: "Réussie", failed: "Échec",
  interrupted: "Interrompue", blocked: "Bloquée", needs_human_review: "Revue humaine requise",
};
const STEP_KIND: Record<StepKind, string> = {
  spec: "Spécification", code: "Code", revision: "Correction", test: "Tests", preview: "Aperçu",
};
const ARTIFACT_KIND: Record<ArtifactKind, string> = {
  spec: "Spécification", diff: "Diff de code", test_log: "Journal des tests",
  preview: "Aperçu", transcript: "Conversation de l’agent", commit: "Référence de commit",
};
const REASONS: Record<string, string> = {
  runner_died: "Le processus d’exécution s’est arrêté. Une reprise explicite doit être confirmée dans le runner.",
  subscription_quota: "Quota d’abonnement atteint. Attendre son rétablissement, sans bascule vers une API payante.",
  subscription_auth_required: "Connexion à l’abonnement requise. Aucun repli API n’est autorisé.",
  cli_nonzero_exit: "Le CLI a signalé un échec. Consulter les traces avant une nouvelle tentative.",
  secret_detected: "Contenu sensible détecté : intervention du propriétaire requise.",
  repo_head_mismatch: "La branche a changé : vérifier le dépôt avant toute reprise.",
  runner_error: "Erreur du runner : consulter les traces avant toute reprise.",
  test_harness_changed: "Vérification non exécutée : le dispositif de test a changé. Revue et décision explicites du propriétaire requises.",
  sandbox_unavailable: "Vérification non exécutée : le bac à sable requis est indisponible. Faire vérifier l’environnement avant toute nouvelle tentative.",
};

/** Presentation only: persisted state is not proof of a live process or a validated delivery. */
export function AtelierMissionList({ missions, unavailable = false }: { missions: MissionView[]; unavailable?: boolean }) {
  return (
    <section className="mb-6 min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--ink-950)] p-4 text-sm text-[var(--fg)] sm:p-5" aria-labelledby="atelier-local-title">
      <h2 id="atelier-local-title" className="text-lg font-semibold">Missions atelier locales</h2>
      <p className="mt-2 text-[var(--fg-muted)]">États et preuves enregistrés sur cet hôte. Cette vue ne confirme pas l’activité en direct et ne relance aucune étape.</p>
      {unavailable ? (
        <p role="alert" className="mt-4 text-[var(--coral)]">Lecture des missions indisponible. Rechargez la page ; si le problème persiste, faites vérifier le stockage Atelier. Aucune absence de mission n’est confirmée.</p>
      ) : missions.length === 0 ? (
        <p className="mt-4">Aucune mission atelier locale dans cet espace.</p>
      ) : missions.map(m => <MissionEvidence key={m.id} mission={m} />)}
    </section>
  );
}

function MissionEvidence({ mission: m }: { mission: MissionView }) {
  const lastTestIndex = m.steps.findLastIndex(s => s.kind === "test" && s.executor === "runner");
  const lastTest = m.steps[lastTestIndex];
  const changedAfterTest = lastTestIndex >= 0 && m.steps.slice(lastTestIndex + 1).some(s => s.executor !== "runner");
  const latestStep = m.steps.at(-1);
  const reason = latestStep?.reason;
  const statusColor = m.status === "failed" ? "text-[var(--coral)]" : "text-[var(--marigold)]";
  const savedAt = new Date(m.updatedAt);
  const savedAtLabel = Number.isNaN(savedAt.getTime()) ? "Date non disponible" : `${new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(savedAt)} UTC`;
  return (
    <article className="mt-5 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--ink-900)] p-4">
      <h3 className="break-words text-base font-semibold">{m.title}</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-[var(--fg-muted)]">{m.need}</p>
      <p className="mt-2">Dernier état enregistré : <strong className={statusColor}>{MISSION_STATUS[m.status] ?? "État non reconnu"}</strong></p>
      <p className="mt-1 text-xs text-[var(--fg-muted)]">Dernière sauvegarde : <time dateTime={m.updatedAt}>{savedAtLabel}</time></p>
      <p className="mt-1 text-[var(--fg-muted)]">{RUNTIME_NAME[m.runtime.runtimeId] ?? "Runtime non reconnu"} · abonnement · aucune connexion active déduite</p>
      {m.status === "awaiting_review" && <p className="mt-3">Résultat à relire par le propriétaire ; ce statut ne vaut pas validation indépendante.</p>}
      {m.status === "interrupted" && <p className="mt-3">Reprise explicite à confirmer dans le runner. La présence d’une session enregistrée ne garantit pas qu’elle soit encore disponible.</p>}
      {reason && <p className="mt-3 text-[var(--coral)]">{REASONS[reason] ?? "Une interruption ou une erreur a été signalée. Consulter le motif technique avant toute reprise."}</p>}

      <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-[var(--fg-muted)]">Modèle demandé</dt><dd className="break-all">{m.modelProof.requested}</dd></div>
        <div className="min-w-0"><dt className="text-[var(--fg-muted)]">Dernier modèle observé</dt><dd className="break-all">{m.modelProof.observed ?? "Non prouvé"}</dd></div>
      </dl>
      {m.modelProof.observed && !m.modelProof.matches && <p className="mt-3 text-[var(--coral)]">Écart de modèle : l’identifiant observé diffère du modèle demandé.</p>}
      <p className="mt-4">Dernière vérification enregistrée par le runner : {lastTest?.status === "needs_human_review" ? "Tests non exécutés — revue humaine requise" : lastTest ? STEP_STATUS[lastTest.status] : "aucun test enregistré"}.</p>
      {changedAfterTest && <p className="mt-1 text-[var(--marigold)]">Une étape agent plus récente existe : ce test ne valide pas l’état actuel.</p>}

      <h4 className="mt-5 font-semibold">Artefacts enregistrés ({m.artifacts.length})</h4>
      <p className="mt-1 text-[var(--fg-muted)]">Les conversations ne sont pas des preuves de validation. Les empreintes ci-dessous sont enregistrées, pas revérifiées par cette vue.</p>
      {m.artifacts.length === 0 ? <p className="mt-2">Aucun artefact enregistré pour cette mission.</p> : (
        <ul className="mt-3 space-y-3">
          {m.artifacts.map(a => {
            const stepIndex = m.steps.findIndex(s => s.id === a.stepId);
            const filename = a.path.split(/[\\/]/).at(-1) || a.kind;
            const stepLabel = stepIndex >= 0 ? `étape ${stepIndex + 1} · ${STEP_KIND[m.steps[stepIndex].kind]}` : "étape non retrouvée";
            return <li key={a.id} className="min-w-0 rounded-lg border border-[var(--border)] p-3">
              <a className="inline-flex min-h-11 max-w-full items-center break-all rounded px-1 py-2 text-[var(--marigold)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marigold)]" href={`/api/atelier/missions/${encodeURIComponent(m.id)}/artifacts/${encodeURIComponent(a.id)}?workspace=${encodeURIComponent(m.workspaceId)}`}>
                {ARTIFACT_KIND[a.kind]} — {filename} — {stepLabel}
              </a>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">{a.bytes} octets · empreinte SHA-256 enregistrée</p>
              <p className="mt-1 break-all font-mono text-xs text-[var(--fg-muted)]">{a.sha256}</p>
            </li>;
          })}
        </ul>
      )}

      <details className="mt-5 rounded-lg border border-[var(--border)] px-3">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marigold)]">Historique et détails techniques</summary>
        <div className="space-y-2 pb-3 text-[var(--fg-muted)]">
          <p className="break-all">Mission : {m.id}</p>
          <p className="break-all">Branche : {m.repo.branch} · HEAD enregistré : {m.repo.headSha.slice(0, 7)}</p>
          {reason && <p className="break-all">Motif technique : {reason}</p>}
          {m.steps.length === 0 ? <p>Aucune étape enregistrée.</p> : <ol className="list-decimal space-y-2 pl-5">{m.steps.map(s => <li key={s.id} className="break-words">{STEP_KIND[s.kind]} : {STEP_STATUS[s.status]}{s.resumedFrom ? " · reprise de session enregistrée" : ""}{s.exitCode !== null ? ` · code de sortie ${s.exitCode}` : ""}</li>)}</ol>}
        </div>
      </details>
    </article>
  );
}
