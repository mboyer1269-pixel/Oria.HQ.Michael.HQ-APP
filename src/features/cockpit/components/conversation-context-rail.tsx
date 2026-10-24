import Link from "next/link";
import type { AssistantProfile } from "@/core/types";
import type { ChatResponse } from "@/features/hq/components/command-center";
import { missionDossierHref } from "@/features/missions/development-mission-handoff";

export function ConversationContextRail({ assistant, workspaceName, result, loading, error }: {
  assistant: AssistantProfile;
  workspaceName: string;
  result: ChatResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const href = missionDossierHref(result?.missionPlanResult?.missionId);
  return (
    <aside aria-label="Dossier du dernier échange" className="conversation-context rounded-3xl border border-neutral-800 bg-[var(--ink-900)] p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-purple-300">Dossier ouvert</p>
      <h2 className="mt-2 text-xl font-semibold text-white">Le contexte, à portée de main</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-400">Dernier échange de cet écran uniquement. Ce rail n’est pas une mémoire persistante.</p>
      <dl className="mt-5 grid gap-4 text-sm">
        <div><dt className="text-neutral-400">Espace</dt><dd className="break-words text-white">{workspaceName}</dd></div>
        <div><dt className="text-neutral-400">Assistant configuré</dt><dd className="break-words text-white">{assistant.name}</dd><dd className="mt-1 break-all font-mono text-xs text-neutral-400">ID stable : {assistant.id}</dd></div>
        <div><dt className="text-neutral-400">Runtime configuré, connexion non attestée ici</dt><dd className="break-all text-white">{assistant.runtimeId}</dd></div>
        <div><dt className="text-neutral-400">État de l’échange</dt><dd className="mt-1 text-amber-200">{loading ? "Réponse en attente" : error ? "Demande en échec — saisie conservée" : result?.requiresConfirmation ? "Proposition — confirmation requise" : result ? "Retour serveur reçu" : "Aucun échange envoyé"}</dd></div>
        <div><dt className="text-neutral-400">Dossier de mission</dt><dd>{href ? <Link href={href} className="inline-flex min-h-11 items-center text-amber-200 underline">Ouvrir le dossier lié</Link> : <span className="text-neutral-300">Aucun lien valide fourni.</span>}</dd></div>
        <div><dt className="text-neutral-400">Preuves et limites</dt><dd className="mt-1 leading-6 text-neutral-300">{result ? "Le contenu ci-contre est un retour serveur, pas une vérification indépendante du résultat." : "Aucun résultat observé dans cet écran."} Aucun revenu encaissé ni travail validé n’est déduit de cette réponse.</dd></div>
        {result?.ledgerStatus && <div><dt className="text-neutral-400">Journal, selon la réponse</dt><dd className="text-neutral-300">{result.ledgerStatus === "recorded" ? "Enregistrement rapporté" : "À vérifier"}</dd></div>}
      </dl>
    </aside>
  );
}
