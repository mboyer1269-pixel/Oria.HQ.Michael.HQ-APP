"use client";

// ---------------------------------------------------------------------------
// OutboundBatchPanel — CEO batch approval UI
// ---------------------------------------------------------------------------
// Read-only view of a pending OutboundBatch.
// Michael can approve, block, or request revision.
//
// This component is client-side to support interactive controls.
// Data is passed as props from the server page.
// ---------------------------------------------------------------------------

import { ShieldCheck, ShieldX, AlertTriangle, Clock, Hash, MessageSquare } from "lucide-react";
import type {
  OutboundBatch,
  PolicyDecisionRecord,
  SuppressionEntry,
  ReputationState,
} from "@/server/outbound/outbound-types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RiskBadge({ level }: { level: OutboundBatch["riskLevel"] }) {
  const map = {
    low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[level]}`}>
      {level}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-center">
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-600">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export type OutboundBatchPanelProps = {
  batch: OutboundBatch;
  policyDecision?: PolicyDecisionRecord;
  suppressionHits?: SuppressionEntry[];
  reputationState?: ReputationState | null;
  /** Called when CEO approves */
  onApprove?: (batchId: string) => void;
  /** Called when CEO blocks */
  onBlock?: (batchId: string, reason: string) => void;
};

export function OutboundBatchPanel({
  batch,
  policyDecision,
  suppressionHits = [],
  reputationState,
  onApprove,
  onBlock,
}: OutboundBatchPanelProps) {
  const canApprove = batch.state === "pending_approval" && policyDecision?.decision !== "BLOCK";
  const hasSuppression = suppressionHits.length > 0;
  const circuitOpen = reputationState?.circuitBreaker === "open";

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Batch outbound
            </span>
          </div>
          <h3 className="mt-1 text-sm font-bold text-white">
            {batch.subVoie} — {batch.audienceType}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RiskBadge level={batch.riskLevel} />
            <span className="text-xs text-neutral-600">#{batch.id.slice(0, 8)}</span>
          </div>
        </div>

        {/* Policy decision badge */}
        {policyDecision && (
          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
            policyDecision.decision === "ALLOW"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : policyDecision.decision === "REQUIRE_APPROVAL"
              ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
              : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}>
            {policyDecision.decision === "ALLOW" && <ShieldCheck className="h-3 w-3" />}
            {policyDecision.decision === "BLOCK" && <ShieldX className="h-3 w-3" />}
            {policyDecision.decision === "REQUIRE_APPROVAL" && <AlertTriangle className="h-3 w-3" />}
            Sentinelle: {policyDecision.decision}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Destinataires" value={batch.recipientCount} sub={`cap: ${batch.volumeCap}`} />
        <StatCard label="Juridiction" value={batch.jurisdiction} />
        <StatCard label="Consentement" value={batch.consentBasis} />
        <StatCard label="Suppression" value={hasSuppression ? `⛔ ${suppressionHits.length}` : "✓ 0"} />
      </div>

      {/* Send window */}
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
        <Clock className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        <span className="text-xs text-neutral-400">
          Fenêtre d&apos;envoi :{" "}
          <span className="font-mono text-neutral-300">
            {batch.sendWindow.start.slice(0, 16).replace("T", " ")}
          </span>
          {" → "}
          <span className="font-mono text-neutral-300">
            {batch.sendWindow.end.slice(0, 16).replace("T", " ")}
          </span>
        </span>
      </div>

      {/* Content hash */}
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
        <Hash className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        <span className="text-xs text-neutral-500">
          contentHash:{" "}
          <span className="font-mono text-neutral-400">{batch.contentHash.slice(0, 16)}...</span>
          {" "}— approuvé après modification = token expiré
        </span>
      </div>

      {/* Message template preview */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold text-neutral-500">Template message</p>
        <pre className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-xs leading-5 text-neutral-300 whitespace-pre-wrap">
          {batch.messageTemplate}
        </pre>
      </div>

      {/* AI disclosure */}
      {batch.aiDisclosure && (
        <div className="mt-3 rounded-xl border border-sky-500/10 bg-sky-500/5 px-3 py-2">
          <p className="text-xs text-sky-400">
            <span className="font-semibold">Disclaimer IA :</span> {batch.aiDisclosure}
          </p>
        </div>
      )}

      {/* Policy warnings */}
      {policyDecision && (policyDecision.complianceFlags.length > 0 || policyDecision.consentIssues.length > 0) && (
        <div className="mt-4 space-y-1.5">
          {[...policyDecision.complianceFlags, ...policyDecision.consentIssues].map((flag, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
              <span className="text-xs text-orange-300">{flag}</span>
            </div>
          ))}
        </div>
      )}

      {/* Reputation state */}
      {reputationState && (
        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">Réputation domaine ({reputationState.domain})</span>
            <span className={`text-xs font-semibold ${circuitOpen ? "text-red-400" : "text-emerald-400"}`}>
              Circuit: {reputationState.circuitBreaker}
            </span>
          </div>
          <div className="mt-1 flex gap-4 text-xs text-neutral-500">
            <span>Bounce: {(reputationState.rollingBounceRate * 100).toFixed(1)}%</span>
            <span>Plaintes: {(reputationState.rollingComplaintRate * 100).toFixed(2)}%</span>
            <span>{reputationState.dailySentCount}/{reputationState.dailyCap} envoyés</span>
          </div>
        </div>
      )}

      {/* Actions */}
      {batch.state === "pending_approval" && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => onApprove?.(batch.id)}
            disabled={!canApprove}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
              canApprove
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "cursor-not-allowed bg-neutral-800 text-neutral-600"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Approuver le batch
          </button>
          <button
            onClick={() => onBlock?.(batch.id, "CEO rejection")}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
          >
            <ShieldX className="h-4 w-4" />
            Bloquer
          </button>
        </div>
      )}

      {batch.state === "approved" && batch.approvedBy && (
        <div className="mt-4 flex items-center gap-2 text-xs text-emerald-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          Approuvé · token lié au contentHash · valid jusqu&apos;à fin de fenêtre
        </div>
      )}

      {batch.state === "blocked" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-red-500">
          <ShieldX className="h-3.5 w-3.5" />
          Batch bloqué
        </div>
      )}
    </div>
  );
}
