"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MissionApprovalBinding } from "@/server/missions/mission-approval-binding";

type Review = { reviewHash: string; binding: MissionApprovalBinding; mission: {
  title: string; objective: string; expectedOutput: string; scope: string; acceptanceCriteria: string } };
const labels: Record<string, string> = {
  approved: "Approbation enregistrée pour dix minutes. Le lancement reste une action distincte.",
  rejected: "Mission retournée au brouillon.", revoked: "Approbation révoquée. Cela n’arrête pas un processus déjà lancé.",
  submission_required: "Préparez puis confirmez le dossier OpenHands de cette mission avant sa revue d’exécution.",
  configuration_unavailable: "Le profil d’exécution n’est pas disponible.", account_unavailable: "La connexion de l’exécutant n’est pas qualifiée.",
  review_changed: "La mission, le compte ou le profil a changé. Ouvrez une nouvelle revue.",
  decision_changed: "Une décision plus récente existe. Rechargez la revue.",
  unavailable: "La revue est indisponible. Aucune approbation confirmée.",
  model_selection_required: "Un modèle natif précis doit être choisi dans le profil d’exécution avant cette approbation.",
};
export function MissionApprovalControls({ missionId }: { missionId: string }) {
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function act(action: "prepare" | "approve" | "reject" | "revoke") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/missions/approval", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, missionId, ...(action === "approve" || action === "reject" ? { expectedReviewHash: review?.reviewHash } : {}),
          ...(action === "revoke" ? { expectedApprovalId: approvalId } : {}) }) });
      const data = await response.json();
      setApprovalId(data.status === "approved" ? data.approvalId : data.previousDecision?.status === "approved" && !["revoked","rejected"].includes(data.status) ? data.previousDecision.id : null);
      if (response.ok && data.status === "prepared") setReview(data as Review);
      else { setReview(null); setMessage(labels[data.status] ?? "La demande n’a pas été acceptée."); }
      if (["approved","rejected","revoked"].includes(data.status)) router.refresh();
    } catch { setMessage(labels.unavailable); setReview(null); }
    finally { setBusy(false); }
  }
  const button = "min-h-11 rounded-lg border border-neutral-600 px-4 py-2 text-sm text-white disabled:opacity-40";
  return <div className="mt-4 space-y-3">
    <button type="button" disabled={busy} className={button} onClick={() => void act("prepare")}>Examiner avant d’approuver</button>
    {review && <section aria-label="Décision d’exécution" className="space-y-3 rounded-xl border border-neutral-700 p-4 text-sm text-neutral-300">
      <p><strong>Périmètre :</strong> {review.mission.scope}</p>
      <p><strong>Critères de réussite :</strong> {review.mission.acceptanceCriteria}</p>
      <p><strong>Accès :</strong> {review.binding.access.providerId} · abonnement · compte {review.binding.access.accountId}</p>
      <p><strong>Profil :</strong> {review.binding.access.modelId}. Le modèle exact sera rapporté après exécution s’il est fourni.</p>
      <p><strong>Modèle demandé :</strong> {review.binding.launch.config.foundationModelId}. L’exécution doit confirmer ce choix avant d’envoyer la mission.</p>
      <p><strong>Source :</strong> <code className="break-all">{review.binding.launch.commitSha}</code></p>
      <p><strong>Limites :</strong> {review.binding.launch.config.maxIterations} étapes, {review.binding.launch.config.timeoutSeconds} secondes,
        {" "}{review.binding.launch.config.maxTokens.toLocaleString("fr-CA")} tokens déclarés. Le plafond de tokens n’est pas garanti par cet exécutant.</p>
      <p>Plafond déclaré : {(review.binding.launch.config.maxCostCents / 100).toFixed(2)} USD. Consommation de l’abonnement inconnue ; aucune bascule vers une API payante.</p>
      <p>Outils refusés par défaut. Cette approbation vaut dix minutes et ne démarre pas la mission.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => void act("approve")}>Approuver ce dossier</button>
        <button type="button" className={button} disabled={busy} onClick={() => void act("reject")}>Retour au brouillon</button>
      </div>
    </section>}
    {approvalId && <button type="button" className={button} disabled={busy} onClick={() => void act("revoke")}>Révoquer l’approbation</button>}
    <p role="status" aria-live="polite" className="text-sm text-neutral-400">{busy ? "Vérification…" : message}</p>
  </div>;
}
