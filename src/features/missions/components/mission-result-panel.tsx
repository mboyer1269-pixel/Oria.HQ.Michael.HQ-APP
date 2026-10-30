"use client";

import Link from "next/link";
import type { Route } from "next";
import type { MissionReportedOutput } from "../mission-dossier";

function downloadReportedText(text: string, filename = "compte-rendu-mission-non-valide.txt") {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function MissionResultPanel({ output, source, showAtelierLink = true }: {
  output: MissionReportedOutput;
  source: "supabase" | "local" | "mock";
  showAtelierLink?: boolean;
}) {
  const spec = output.atelierSpec;
  return <section aria-label="Résultat de la mission" className="mt-5 min-w-0 rounded-xl border border-neutral-700 p-4">
    <h4 className="text-sm font-semibold text-white">Résultat de la mission</h4>
    <p className="mt-2 text-xs leading-5 text-neutral-400">
      {source === "supabase" ? "Source : données enregistrées dans cette mission." : "Source locale : exemple ou donnée temporaire, aucune exécution réelle attestée."}
      {" "}Validation indépendante non reliée.
    </p>
    {output.state === "reported" && output.text !== null ? <details className="mt-3 min-w-0">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-300">Ouvrir le compte rendu rapporté</summary>
      <p className="mb-3 text-xs leading-5 text-amber-200">Ce texte est un résultat rapporté, pas une preuve de validation du livrable.</p>
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-950 p-3 text-sm leading-6 text-neutral-200 [overflow-wrap:anywhere]">{output.text}</pre>
      {output.truncated && <p className="mt-2 text-xs text-amber-200">Compte rendu limité aux 100 000 premiers caractères ; le téléchargement contient le même extrait.</p>}
      <button type="button" onClick={() => downloadReportedText(output.text!)} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-3 text-sm text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-300">Télécharger ce compte rendu (.txt)</button>
    </details> : <p className="mt-3 text-sm text-neutral-400">Aucun compte rendu enregistré à ouvrir.</p>}
    {output.process && <p className="mt-3 text-xs leading-5 text-neutral-400">Processus OpenHands arrêté, selon les données enregistrées de cette mission : code de sortie {output.process.exitCode}, délai {output.process.deadlineExceeded ? "dépassé" : "non dépassé"}. Cette observation ne valide pas le résultat.</p>}
    {spec && spec.state !== "absent" && <div id="atelier-owner-spec" className="mt-4 min-w-0 space-y-3">
      <h5 className="text-sm font-semibold text-white">{spec.state === "recorded" && spec.artifact ? "Spécification Atelier enregistrée" : "Suivi de la réservation Atelier"}</h5>
      {spec.state === "unverified" ? <p role="status" className="text-sm text-amber-200">Un enregistrement existe, mais sa liaison à cette mission n’a pas pu être vérifiée. Aucun contenu n’est présenté ni exporté ; relisez le dossier sans relancer.</p>
        : <>
          <p className="break-all text-xs text-neutral-400">Référence de réservation : {spec.runId}</p>
          {spec.state === "reserved" && <p className="text-sm text-amber-200">Réservation enregistrée, sans lancement. La qualification de l’hôte et la confirmation d’exécution restent des étapes distinctes ; ce parcours ne lance aucun agent.</p>}
          {spec.state === "awaiting_result" && <p className="text-sm text-amber-200">Une admission est enregistrée, mais aucun résultat lié n’est disponible. L’issue reste à réconcilier ; aucune relance n’est proposée.</p>}
          {spec.state === "recorded" && <>
            <p className="text-sm text-amber-200">État historique rapporté : {({ succeeded: "spécification produite", failed: "échec", blocked: "bloqué", interrupted: "interrompu", reconciliation_required: "réconciliation nécessaire" })[spec.status]}. Cohérence du reçu vérifiée ; aucune validation indépendante ni aucune autorisation actuelle d’exécution.</p>
            {spec.artifact && <details className="min-w-0">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-300">Ouvrir SPEC.md enregistré</summary>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-950 p-3 text-sm [overflow-wrap:anywhere]">{spec.artifact.text}</pre>
              <p className="mt-2 break-all text-xs text-neutral-400">{spec.artifact.bytes} octets · SHA256 {spec.artifact.sha256}</p>
              <p className="mt-2 break-all text-xs text-neutral-400">Commit de base du reçu : {spec.artifact.baseSha}</p>
              <button type="button" onClick={() => downloadReportedText(spec.artifact!.text, "SPEC.md")} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-3 text-sm text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-300">Télécharger SPEC.md</button>
            </details>}
          </>}
        </>}
      {showAtelierLink && !output.receipt && <Link href={`/hq/atelier?mission=${encodeURIComponent(output.missionId)}#atelier-owner-spec` as Route} className="inline-flex min-h-11 items-center rounded-lg border border-neutral-700 px-3 text-sm text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-300">Ouvrir ce suivi dans Atelier</Link>}
    </div>}
    {output.receipt && <div className="mt-4 min-w-0 space-y-3">
      <h5 className="text-sm font-semibold text-white">Retour d’OpenHands</h5>
      <p className="text-sm text-amber-200">{output.receipt.report.executionState === "agent_returned" ? "L’agent a rendu la main ; résultat à examiner." : output.receipt.report.executionState === "execution_error" ? "Exécution interrompue par une erreur." : output.receipt.report.executionState === "cleanup_error" ? "Une erreur est survenue à la fermeture de l’exécution." : output.receipt.report.executionState === "model_selection_required" ? "Le modèle demandé n’a pas été confirmé ; la mission n’a pas été envoyée." : "Connexion à l’abonnement requise ; aucun résultat IA confirmé."}</p>
      <details className="min-w-0 text-xs leading-5 text-neutral-400">
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-neutral-200 focus-visible:outline-2 focus-visible:outline-amber-300">Modèles et consommation</summary>
        <p className="break-all">Demandé : {output.receipt.report.modelExecution?.requestedModelId ?? "inconnu"}</p>
        <p className="break-all">Sélection confirmée par ACP : {output.receipt.report.modelExecution?.acpConfirmedModelId ?? "inconnue"}</p>
        <p className="break-all">Modèles rapportés par le fournisseur : {output.receipt.report.modelExecution?.observedModelIds?.join(", ") || "inconnus"}</p>
        <p>Tokens du flux principal — entrée : {output.receipt.report.modelExecution?.mainLoopUsage?.inputTokens?.toLocaleString("fr-CA") ?? "inconnue"} ; sortie : {output.receipt.report.modelExecution?.mainLoopUsage?.outputTokens?.toLocaleString("fr-CA") ?? "inconnue"}.</p>
        {output.receipt.report.modelExecution?.modelUsage?.map(usage => <p key={usage.modelId} className="break-all">{usage.modelId} — entrée : {usage.inputTokens?.toLocaleString("fr-CA") ?? "inconnue"} ; sortie : {usage.outputTokens?.toLocaleString("fr-CA") ?? "inconnue"}.</p>)}
        <p>Les mesures par modèle peuvent inclure des sous-agents ; elles ne sont pas additionnées au flux principal. Quota d’abonnement restant inconnu.</p>
      </details>
      <p className="text-xs leading-5 text-neutral-400">Reçu le {output.receipt.receivedAt}. Fichiers sélectionnés uniquement ; cette liste ne représente pas toutes les modifications. Aucune validation indépendante effectuée.</p>
      {showAtelierLink && <Link
        href={`/hq/atelier?mission=${encodeURIComponent(output.missionId)}` as Route}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-500/30 px-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-amber-300"
      >
        Ouvrir le résultat dans Atelier
      </Link>}
      {output.receipt.report.summary.status === "present" && <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-300 break-words">Ouvrir le rapport du fichier {output.receipt.report.summary.path}</summary>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-950 p-3 text-sm [overflow-wrap:anywhere]">{output.receipt.report.summary.text}</pre>
        <button type="button" onClick={() => downloadReportedText(output.receipt!.report.summary.text!, "rapport-fichier-selectionne-non-valide.txt")} className="mt-3 min-h-11 rounded-lg border border-neutral-700 px-3 text-sm text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-300">Télécharger le rapport sélectionné (.txt)</button>
      </details>}
      {output.receipt.report.files.map(file => <details key={file.path} className="min-w-0 rounded-lg border border-neutral-800 px-3">
        <summary className="min-h-11 cursor-pointer break-words py-3 text-sm text-neutral-200 focus-visible:outline-2 focus-visible:outline-amber-300">{file.path} · {{ added: "Ajouté", modified: "Modifié", deleted: "Supprimé", missing: "Absent", unchanged: "Inchangé" }[file.status]}</summary>
        {file.diff ? <>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words bg-neutral-950 p-3 text-xs leading-5 [overflow-wrap:anywhere]">{file.diff}</pre>
          <button type="button" onClick={() => downloadReportedText(file.diff, "modification-selectionnee.diff")} className="my-2 min-h-11 rounded-lg border border-neutral-700 px-3 text-sm text-amber-200 focus-visible:outline-2 focus-visible:outline-amber-300">Télécharger cette différence</button>
        </> : <p className="pb-3 text-xs text-neutral-400">Aucune différence de contenu dans ce reçu.</p>}
      </details>)}
    </div>}
    <p className="mt-3 text-xs leading-5 text-neutral-400">{output.receipt ? "Atelier ouvre le même reçu persistant et les différences sélectionnées ci-dessus." : spec?.state === "recorded" && spec.artifact ? "Seul SPEC.md est relié à ce reçu. Aucun aperçu exécutable ni validation indépendante." : "Les fichiers, différences de code et aperçus exécutables ne sont pas encore reliés à ce dossier."}</p>
  </section>;
}
