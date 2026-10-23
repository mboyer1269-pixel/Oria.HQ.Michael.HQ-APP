import { Plug } from "lucide-react";
import type { PersonalConnectionStatus } from "@/core/personal-connection-status";
import { HqWidget } from "@/features/hq/components/hq-widget-system";

const EVIDENCE_LABELS = {
  not_checked: "Non vérifiée",
  not_configured: "Lecture de preuve non configurée",
  scope_mismatch: "Périmètre de connexion différent",
  policy_mismatch: "Politique de connexion différente",
  unavailable: "Preuve indisponible",
  missing: "Aucune preuve enregistrée",
  invalid: "Preuve invalide",
  stale: "Preuve périmée ou datée dans le futur",
  not_connected: "Compte non attesté",
  observed: "Preuve fraîche observée",
} as const;

export function PersonalConnectionStatusPanel({ status }: { status: PersonalConnectionStatus }) {
  const connection = status.connection;
  const nextAction = !connection
    ? "Vérifier la configuration du raccordement avec l’opérateur."
    : connection.adapterStatus === "unavailable"
      ? "Raccorder et qualifier l’adaptateur de ce fournisseur avant de demander une mission."
      : connection.evidenceStatus === "observed"
        ? "Vérifier le raccordement de confirmation, le compte et les autorisations avant une mission depuis HQ."
        : "Faire actualiser la preuve du compte sur le runner approuvé, puis actualiser cette page.";

  return (
    <HqWidget title="Comptes personnels — raccordement du runner" eyebrow="Connexion observée" icon={Plug} tone="violet">
      <p className="text-sm leading-6 text-neutral-400">
        Cette vue présente le raccordement configuré et sa preuve enregistrée. Une preuve de compte
        reste distincte des autorisations et du résultat d’une mission.
      </p>
      {!connection ? (
        <p role="status" className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          {status.status === "not_configured" ? "Aucun raccordement fournisseur configuré." : "État du raccordement indisponible."}
        </p>
      ) : (
        <dl className="mt-4 grid gap-4 rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-neutral-500">Fournisseur du profil</dt><dd className="mt-1 text-neutral-200">{connection.provider === "claude" ? "Claude" : "Codex"}</dd></div>
          <div><dt className="text-neutral-500">Adaptateur d’exécution</dt><dd className="mt-1 text-neutral-200">{connection.adapterStatus === "implemented" ? "Implémenté" : "Indisponible"}</dd></div>
          <div><dt className="text-neutral-500">Référence du runner</dt><dd className="mt-1 break-all font-mono text-xs text-neutral-300">{connection.runnerRef}</dd></div>
          <div><dt className="text-neutral-500">Référence opaque du compte observé</dt><dd className="mt-1 break-all font-mono text-xs text-neutral-300">{connection.accountRef ?? "Non attestée"}</dd></div>
          <div><dt className="text-neutral-500">Preuve de connexion</dt><dd className="mt-1 text-neutral-200">{EVIDENCE_LABELS[connection.evidenceStatus]}</dd></div>
          <div><dt className="text-neutral-500">Vérification prévue à la confirmation</dt><dd className="mt-1 text-neutral-200">{connection.confirmationTransport === "persisted" ? "Preuve persistée autorisée" : "Contrôle depuis l’environnement opérateur"}</dd></div>
          <div><dt className="text-neutral-500">Mission vérifiée sur ce compte</dt><dd className="mt-1 text-amber-200">Non vérifiée par cette vue</dd></div>
          <div><dt className="text-neutral-500">Conversation HQ via abonnement</dt><dd className="mt-1 text-neutral-200">Transport à raccorder</dd></div>
        </dl>
      )}
      <p className="mt-4 text-sm text-amber-200">{nextAction}</p>
      <p className="mt-3 text-xs leading-5 text-neutral-500">
        La connexion personnelle s’effectue via le client officiel sur l’hôte choisi. La sélection
        de plusieurs comptes ou hôtes reste à raccorder. Consulter cette carte ne lance aucune connexion fournisseur ni mission.
      </p>
    </HqWidget>
  );
}
