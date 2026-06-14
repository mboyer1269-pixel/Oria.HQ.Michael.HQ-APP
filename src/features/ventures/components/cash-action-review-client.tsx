"use client";

// Cash Action Review — the one human-in-the-loop screen.
//
// The agent prepares a concrete cash move (CashActionPacket); Michael reviews
// it, approves it for MANUAL action (he performs the outreach himself), then
// records the signal that came back. The signal is persisted (owner-gated
// server action → append-only repository) and the proof is read.
//
// Non-negotiable, enforced by construction:
//   - No automatic send. The "Approved" button only reveals the draft to copy.
//   - No live Stripe. No webhook. No external action. No runtime dispatch.
//   - Persistence is append-only proof capture, owner/workspace-scoped. Strict
//     accounting: only a verified financial signal can carry real cash.

import { useState } from "react";
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Database,
  Eye,
  HardDriveDownload,
  Lock,
  Send,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { getCouncilRoleDisplayName } from "@/features/agents/naming";
import { phaseLabel } from "@/features/workflows/run-lifecycle-phase";
import type { CashActionPacket, CashSignalType } from "../cash-action-packet";
import { CASH_SIGNAL_TYPES } from "../cash-action-packet";
import type { CashSignalIntake } from "../cash-signal-intake";
import type {
  CashSignalIntakeRawInput,
  SaveCashSignalIntakeAction,
} from "../cash-signal-intake-persistence-types";
import type { CapturedSignalSummary, CashActionDecision } from "../cash-action-review";
import { summarizeCapturedSignal } from "../cash-action-review";
import type {
  CouncilAnalysis,
  CouncilTurnDisplay,
  HermesPlanDisplay,
} from "../cash-action-review-projection";
import type { VenturePersistenceMode } from "../venture-save-types";

// Display projection types live in the pure projection module so the server
// page and this client component share one definition. Re-exported here to keep
// existing import sites working.
export type { CouncilAnalysis, CouncilTurnDisplay, HermesPlanDisplay };

type CashActionReviewClientProps = {
  packets: CashActionPacket[];
  councilAnalyses?: CouncilAnalysis[];
  hermesPlans?: HermesPlanDisplay[];
  generatedAt: string;
  // Where the displayed packets came from: the durable prepared-action queue
  // ("prepared_queue") or on-open live generation ("live").
  sourceMode?: "prepared_queue" | "live";
  // True when the prepared-action queue could not be read (e.g. migration 0013
  // not yet applied in prod) and the page fell back to live generation.
  preparedQueueUnavailable?: boolean;
  savedIntakes: CashSignalIntake[];
  storageMode: VenturePersistenceMode;
  loadError: boolean;
  onSave: SaveCashSignalIntakeAction;
};

type SignalFormState = {
  signalType: CashSignalType;
  referenceId: string;
  summary: string;
  isVerified: boolean;
  amountText: string;
};

type CaptureResult =
  | { ok: true; summary: CapturedSignalSummary; storageMode: VenturePersistenceMode }
  | { ok: false; errors: string[] };

const SIGNAL_LABELS: Record<CashSignalType, string> = {
  stripe_charge: "Stripe charge (verified cash)",
  signed_loi: "Signed LOI (verified cash)",
  email_reply: "Email reply (market signal)",
  meeting_booked: "Meeting booked (market signal)",
  verbal_commitment: "Verbal commitment (weak)",
  manual_note: "Manual note (exploration)",
};

const CLASS_STYLES: Record<CapturedSignalSummary["classification"], string> = {
  verified_cash: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  market_signal: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  exploration: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

const STORAGE_LABELS: Record<VenturePersistenceMode, string> = {
  supabase: "Durable (Supabase)",
  local: "Local session (dev fallback)",
  unavailable: "Persistence unavailable",
};

function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function defaultForm(packet: CashActionPacket): SignalFormState {
  return {
    signalType: packet.expectedCashSignal,
    referenceId: "",
    summary: "",
    isVerified: false,
    amountText: "",
  };
}

export function CashActionReviewClient({
  packets,
  councilAnalyses = [],
  hermesPlans = [],
  generatedAt,
  sourceMode = "live",
  preparedQueueUnavailable = false,
  savedIntakes,
  storageMode,
  loadError,
  onSave,
}: CashActionReviewClientProps) {
  const [decisions, setDecisions] = useState<Record<string, CashActionDecision>>({});
  const [forms, setForms] = useState<Record<string, SignalFormState>>({});
  const [results, setResults] = useState<Record<string, CaptureResult>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedCouncil, setExpandedCouncil] = useState<Record<string, boolean>>({});
  const [expandedHermes, setExpandedHermes] = useState<Record<string, boolean>>({});

  const councilByPacket = new Map<string, CouncilAnalysis>(
    councilAnalyses.map((ca) => [ca.packetId, ca]),
  );
  const hermesByPacket = new Map<string, HermesPlanDisplay>(
    hermesPlans.map((hp) => [hp.packetId, hp]),
  );

  // Group previously-captured (persisted) proof by packet, most-recent first
  // as returned by the repository.
  const savedByPacket = new Map<string, CashSignalIntake[]>();
  for (const intake of savedIntakes) {
    const list = savedByPacket.get(intake.packetId) ?? [];
    list.push(intake);
    savedByPacket.set(intake.packetId, list);
  }

  function decisionOf(packetId: string): CashActionDecision {
    return decisions[packetId] ?? "pending";
  }
  function formOf(packet: CashActionPacket): SignalFormState {
    return forms[packet.packetId] ?? defaultForm(packet);
  }
  function setDecision(packetId: string, decision: CashActionDecision) {
    setDecisions((prev) => ({ ...prev, [packetId]: decision }));
  }
  function patchForm(packetId: string, patch: Partial<SignalFormState>, packet: CashActionPacket) {
    setForms((prev) => ({ ...prev, [packetId]: { ...formOf(packet), ...patch } }));
  }

  // Best-effort copy keyed by a caller-chosen id so multiple copy buttons on the
  // same card (packet draft, Relay message) can each flash "Copied" on their own.
  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard is best-effort; the text is visible on screen regardless.
    }
  }

  // Persist the locally-entered signal via the owner-gated server action. The
  // server rebuilds, re-validates, and appends it — nothing executes.
  async function recordSignal(packet: CashActionPacket) {
    const form = formOf(packet);
    const trimmedAmount = form.amountText.trim();
    const amountCents = trimmedAmount === "" ? undefined : Number(trimmedAmount);

    const input: CashSignalIntakeRawInput = {
      signalId: `signal:${packet.packetId}`,
      packetId: packet.packetId,
      ventureId: packet.ventureId,
      sourceAgentId: packet.agentId,
      signalType: form.signalType,
      referenceId: form.referenceId.trim(),
      isVerified: form.isVerified,
      summary: form.summary.trim(),
      capturedAt: new Date().toISOString(),
      ...(amountCents !== undefined ? { amountCents } : {}),
    };

    setSaving((prev) => ({ ...prev, [packet.packetId]: true }));
    try {
      const result = await onSave(input);
      if (result.status === "saved") {
        setResults((prev) => ({
          ...prev,
          [packet.packetId]: {
            ok: true,
            summary: summarizeCapturedSignal(result.intake),
            storageMode: result.storageMode,
          },
        }));
      } else if (result.status === "error") {
        setResults((prev) => ({ ...prev, [packet.packetId]: { ok: false, errors: result.errors } }));
      } else {
        setResults((prev) => ({
          ...prev,
          [packet.packetId]: { ok: false, errors: ["Owner access refused."] },
        }));
      }
    } finally {
      setSaving((prev) => ({ ...prev, [packet.packetId]: false }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium">
          Aucun envoi automatique · aucun Stripe live · aucun webhook · aucune action externe. Capture de preuve uniquement.
        </span>
      </div>

      {preparedQueueUnavailable && (
        <div className="rounded-xl border border-neutral-700/60 bg-neutral-900/40 px-3 py-2 text-[11px] text-neutral-400">
          Prepared queue unavailable — using live generation fallback.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span>
          {sourceMode === "prepared_queue"
            ? `${packets.length} action${packets.length > 1 ? "s" : ""} préparée${packets.length > 1 ? "s" : ""} par Relay · file de revue · préparé ${generatedAt}`
            : `${packets.length} packet${packets.length > 1 ? "s" : ""} généré${packets.length > 1 ? "s" : ""} en direct · ${generatedAt}`}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
            storageMode === "supabase"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : storageMode === "local"
                ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {storageMode === "supabase" ? (
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <HardDriveDownload className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {STORAGE_LABELS[storageMode]}
        </span>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          Captured proof could not be loaded. Newly recorded signals may still save.
        </div>
      )}

      {packets.map((packet) => {
        const decision = decisionOf(packet.packetId);
        const form = formOf(packet);
        const result = results[packet.packetId];
        const isSaving = saving[packet.packetId] === true;
        const priorProof = savedByPacket.get(packet.packetId) ?? [];
        const council = councilByPacket.get(packet.packetId);
        const hermes = hermesByPacket.get(packet.packetId);

        return (
          <article
            key={packet.packetId}
            className="flex flex-col gap-4 rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-white">{packet.targetBuyer}</h3>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  {packet.buyerType.replace(/_/g, " ")} · {packet.packetId}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  decision === "approved_for_manual_action"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : decision === "rejected_needs_refinement"
                      ? "border-red-500/30 bg-red-500/10 text-red-300"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400"
                }`}
              >
                {decision === "approved_for_manual_action"
                  ? "Approved for manual action"
                  : decision === "rejected_needs_refinement"
                    ? "Rejected — needs refinement"
                    : "Pending review"}
              </span>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Pain hypothesis" value={packet.painHypothesis} />
              <Field label="Offer" value={packet.offer} />
              <Field label="Call to action" value={packet.callToAction} />
              <Field
                label="Cash math"
                value={`${formatCents(packet.pricePointCents)} price · ${formatCents(
                  packet.expectedCashImpactCents,
                )} expected impact · ${formatCents(packet.expectedCostCents)} cost · ${packet.expectedRoiMultiple}× ROI`}
              />
            </dl>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Outreach draft — copy &amp; send yourself
                </span>
                <button
                  type="button"
                  onClick={() => copyText(packet.packetId, packet.outreachDraft)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] text-neutral-300 transition hover:border-neutral-600 hover:text-white"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copiedId === packet.packetId ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-200">
                {packet.outreachDraft}
              </p>
              <p className="mt-2 text-[11px] text-neutral-500">
                Expects <span className="text-neutral-300">{packet.expectedCashSignal.replace(/_/g, " ")}</span> ·
                evidence needed: {packet.requiredEvidence.map((e) => e.replace(/_/g, " ")).join(", ")}
              </p>
            </div>

            {council && (
              <CouncilSection
                council={council}
                expanded={expandedCouncil[packet.packetId] === true}
                onToggle={() =>
                  setExpandedCouncil((prev) => ({
                    ...prev,
                    [packet.packetId]: !prev[packet.packetId],
                  }))
                }
              />
            )}

            {hermes && (
              <HermesPlanSection
                hermes={hermes}
                expanded={expandedHermes[packet.packetId] === true}
                onToggle={() =>
                  setExpandedHermes((prev) => ({
                    ...prev,
                    [packet.packetId]: !prev[packet.packetId],
                  }))
                }
                copiedKey={copiedId}
                onCopyMessage={() => copyText(`hermes:${packet.packetId}`, hermes.messageDraft)}
              />
            )}

            {priorProof.length > 0 && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Captured proof on record ({priorProof.length})
                </span>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {priorProof.map((intake, i) => {
                    const s = summarizeCapturedSignal(intake);
                    return (
                      <li key={`${intake.signalId}-${i}`} className="text-xs text-neutral-300">
                        <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] ${CLASS_STYLES[s.classification]}`}>
                          {s.classification.replace(/_/g, " ")}
                        </span>
                        {intake.signalType.replace(/_/g, " ")} · {intake.referenceId}
                        {s.becameRealCash ? ` · ${formatCents(s.cashAmountCents)} real cash` : ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDecision(packet.packetId, "approved_for_manual_action")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
              >
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                Approved for manual action
              </button>
              <button
                type="button"
                onClick={() => setDecision(packet.packetId, "rejected_needs_refinement")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
              >
                <Ban className="h-4 w-4" aria-hidden="true" />
                Rejected / needs refinement
              </button>
            </div>

            {decision === "approved_for_manual_action" && (
              <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Record the signal that came back
                </span>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-neutral-400">
                    Signal type
                    <select
                      value={form.signalType}
                      onChange={(e) => patchForm(packet.packetId, { signalType: e.target.value as CashSignalType }, packet)}
                      className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100"
                    >
                      {CASH_SIGNAL_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {SIGNAL_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-neutral-400">
                    Reference id (charge id, LOI id, message id…)
                    <input
                      value={form.referenceId}
                      onChange={(e) => patchForm(packet.packetId, { referenceId: e.target.value }, packet)}
                      placeholder="ch_… / loi-… / msg-…"
                      className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-neutral-400">
                    Amount in cents (only for verified financial proof)
                    <input
                      value={form.amountText}
                      onChange={(e) => patchForm(packet.packetId, { amountText: e.target.value }, packet)}
                      inputMode="numeric"
                      placeholder="49000"
                      className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100"
                    />
                  </label>

                  <label className="flex items-center gap-2 self-end text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={form.isVerified}
                      onChange={(e) => patchForm(packet.packetId, { isVerified: e.target.checked }, packet)}
                      className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
                    />
                    Verified (I confirmed this proof myself)
                  </label>
                </div>

                <label className="flex flex-col gap-1 text-xs text-neutral-400">
                  Summary (what happened)
                  <textarea
                    value={form.summary}
                    onChange={(e) => patchForm(packet.packetId, { summary: e.target.value }, packet)}
                    rows={2}
                    placeholder="ACME paid the $490 pilot via Stripe charge ch_…"
                    className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100"
                  />
                </label>

                <div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => recordSignal(packet)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {isSaving ? "Saving…" : "Record signal"}
                  </button>
                </div>

                {result && !result.ok && (
                  <div className="flex flex-col gap-1 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      Signal not accepted
                    </span>
                    <ul className="ml-5 list-disc">
                      {result.errors.map((err) => (
                        <li key={err}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result && result.ok && (
                  <div className={`flex flex-col gap-2 rounded-xl border p-3 ${CLASS_STYLES[result.summary.classification]}`}>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                      {result.summary.becameRealCash ? (
                        <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                      {result.summary.headline}
                    </span>
                    <p className="text-[11px] opacity-90">
                      classification: {result.summary.classification.replace(/_/g, " ")} · trust: {result.summary.trustLevel}
                      {result.summary.becameRealCash
                        ? ` · real cash booked: ${formatCents(result.summary.cashAmountCents)}`
                        : " · no real cash (proof not financial-verified)"}
                      {" · "}saved: {STORAGE_LABELS[result.storageMode]}
                    </p>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{label}</dt>
      <dd className="text-sm leading-6 text-neutral-200">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Council section
// ---------------------------------------------------------------------------

const READINESS_STYLES: Record<CouncilAnalysis["readiness"], string> = {
  ready_for_ceo: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  needs_more_evidence: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  blocked_by_auditor: "border-red-500/30 bg-red-500/10 text-red-300",
  needs_refinement: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

const READINESS_LABELS: Record<CouncilAnalysis["readiness"], string> = {
  ready_for_ceo: "Ready for CEO",
  needs_more_evidence: "Needs evidence",
  blocked_by_auditor: "Blocked by Auditor",
  needs_refinement: "Needs refinement",
};

const RECOMMENDATION_STYLES: Record<string, string> = {
  proceed: "text-emerald-400",
  support: "text-emerald-400",
  refine: "text-amber-400",
  pause: "text-amber-400",
  abstain: "text-neutral-500",
  needs_ceo_decision: "text-sky-400",
  kill_candidate: "text-red-400",
  veto: "text-red-400",
};

function CouncilSection({
  council,
  expanded,
  onToggle,
}: {
  council: CouncilAnalysis;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-neutral-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Council Run #{council.runIndex}
          </span>
          {council.runId && council.runPhase && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400"
              title={council.runId}
            >
              Durable · {phaseLabel(council.runPhase)}
            </span>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium ${READINESS_STYLES[council.readiness]}`}
        >
          {READINESS_LABELS[council.readiness]}
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-neutral-300">
        <span className="text-neutral-500">Recommended action: </span>
        {council.recommendedManualAction}
      </p>

      <button
        type="button"
        onClick={onToggle}
        className="mt-3 inline-flex items-center gap-1 text-[10px] text-neutral-500 transition hover:text-neutral-300"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        )}
        {expanded ? "Hide" : "Show"} agent turns ({council.turns.length})
      </button>

      {expanded && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-neutral-800 pt-3">
          {council.turns.map((turn) => (
            <li key={turn.roleId} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="min-w-[64px] text-[10px] font-semibold text-neutral-400">
                  {getCouncilRoleDisplayName(turn.roleId)}
                </span>
                <span
                  className={`text-[10px] font-medium ${RECOMMENDATION_STYLES[turn.recommendation] ?? "text-neutral-400"}`}
                >
                  {turn.recommendation.replace(/_/g, " ")}
                </span>
                <span className="ml-auto text-[10px] text-neutral-600">
                  {Math.round(turn.confidenceScore)}%
                </span>
              </div>
              <p className="text-[11px] leading-4 text-neutral-500">{turn.outputSummary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relay outreach plan section
// ---------------------------------------------------------------------------

const HERMES_CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  x_dm: "X DM",
  linkedin: "LinkedIn",
  indie_hackers: "Indie Hackers",
  reddit: "Reddit",
  manual: "Manual (CEO chooses)",
};

const HERMES_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ready_for_ceo_approval: "Ready for CEO approval",
  approved_for_manual_send: "Approved for manual send",
  rejected: "Rejected",
};

const HERMES_STATUS_STYLES: Record<string, string> = {
  draft: "border-neutral-700 bg-neutral-900 text-neutral-400",
  ready_for_ceo_approval: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  approved_for_manual_send: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  rejected: "border-red-500/30 bg-red-500/10 text-red-300",
};

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

function HermesPlanSection({
  hermes,
  expanded,
  onToggle,
  copiedKey,
  onCopyMessage,
}: {
  hermes: HermesPlanDisplay;
  expanded: boolean;
  onToggle: () => void;
  copiedKey: string | null;
  onCopyMessage: () => void;
}) {
  const channelLabel = HERMES_CHANNEL_LABELS[hermes.channel] ?? humanize(hermes.channel);
  const statusLabel = HERMES_STATUS_LABELS[hermes.approvalStatus] ?? humanize(hermes.approvalStatus);
  const statusStyle =
    HERMES_STATUS_STYLES[hermes.approvalStatus] ?? "border-neutral-700 bg-neutral-900 text-neutral-400";
  const copyKey = `hermes:${hermes.packetId}`;

  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Send className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300/80">
            Relay Outreach Plan
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-medium text-indigo-200">
            {channelLabel}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusStyle}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Always-visible summary line: who sends, and the governance posture. */}
      <p className="mt-3 text-xs leading-5 text-neutral-300">
        <span className="text-neutral-500">Sender: </span>
        {hermes.senderRecommendation}
      </p>

      {hermes.requiresCeoApproval && hermes.requiresManualSend && hermes.noExecutionAuthorized && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-neutral-500">
          <ShieldCheck className="h-3 w-3 text-emerald-400" aria-hidden="true" />
          Relay prepares · CEO approves · manual send only · no automatic execution
        </p>
      )}

      <button
        type="button"
        onClick={onToggle}
        className="mt-3 inline-flex items-center gap-1 text-[10px] text-neutral-500 transition hover:text-neutral-300"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        )}
        {expanded ? "Hide" : "Show"} outreach plan
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-neutral-800 pt-3">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Prospect profile" value={hermes.prospectProfile} />
            <Field label="Prospect selection criteria" value={hermes.prospectSelectionCriteria} />
            <Field label="Personalization basis" value={hermes.personalizationBasis} />
            <Field label="Call to action" value={hermes.cta} />
            <Field label="Expected signal" value={humanize(hermes.expectedSignal)} />
            <Field
              label="Required evidence"
              value={hermes.requiredEvidence.map(humanize).join(", ")}
            />
            <Field label="Compliance notes" value={hermes.complianceNotes} />
            <Field label="Risk notes" value={hermes.riskNotes} />
          </dl>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Message draft — copy &amp; send yourself
              </span>
              <button
                type="button"
                onClick={onCopyMessage}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] text-neutral-300 transition hover:border-neutral-600 hover:text-white"
              >
                <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
                {copiedKey === copyKey ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-200">
              {hermes.messageDraft}
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
              Manual send instructions
            </span>
            <p className="mt-1.5 text-xs leading-5 text-amber-100/90">
              {hermes.manualSendInstructions}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
