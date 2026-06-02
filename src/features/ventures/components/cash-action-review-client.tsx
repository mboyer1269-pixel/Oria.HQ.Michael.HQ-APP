"use client";

// Cash Action Review — the one human-in-the-loop screen.
//
// The agent prepares a concrete cash move (CashActionPacket); Michael reviews
// it, approves it for MANUAL action (he performs the outreach himself), then
// records the signal that came back. The system converts that signal into a
// local CashSignalIntake and reads the proof.
//
// Non-negotiable, enforced by construction:
//   - No automatic send. The "Approved" button only reveals the draft to copy.
//   - No live Stripe. No database. No external action. No server action.
//   - All state is local to this browser session (useState only).

import { useState } from "react";
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  ClipboardCopy,
  Eye,
  Lock,
  TriangleAlert,
} from "lucide-react";
import type { CashActionPacket, CashSignalType } from "../cash-action-packet";
import { CASH_SIGNAL_TYPES } from "../cash-action-packet";
import type { CashSignalIntake } from "../cash-signal-intake";
import { buildCashSignalIntake, validateCashSignalIntake } from "../cash-signal-intake";
import type { CapturedSignalSummary, CashActionDecision } from "../cash-action-review";
import { summarizeCapturedSignal } from "../cash-action-review";

type CashActionReviewClientProps = {
  packets: CashActionPacket[];
  generatedAt: string;
};

type SignalFormState = {
  signalType: CashSignalType;
  referenceId: string;
  summary: string;
  isVerified: boolean;
  amountText: string;
};

type CaptureResult =
  | { ok: true; intake: CashSignalIntake; summary: CapturedSignalSummary }
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

export function CashActionReviewClient({ packets, generatedAt }: CashActionReviewClientProps) {
  const [decisions, setDecisions] = useState<Record<string, CashActionDecision>>({});
  const [forms, setForms] = useState<Record<string, SignalFormState>>({});
  const [results, setResults] = useState<Record<string, CaptureResult>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  async function copyDraft(packet: CashActionPacket) {
    try {
      await navigator.clipboard.writeText(packet.outreachDraft);
      setCopiedId(packet.packetId);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard is best-effort; the draft is visible on screen regardless.
    }
  }

  // Convert the locally-entered signal into a CashSignalIntake and read the
  // proof. Pure and local — nothing leaves this browser.
  function recordSignal(packet: CashActionPacket) {
    const form = formOf(packet);
    const trimmedAmount = form.amountText.trim();
    const amountCents = trimmedAmount === "" ? undefined : Number(trimmedAmount);

    const input = {
      signalId: `signal:${packet.packetId}`,
      packetId: packet.packetId,
      ventureId: packet.ventureId,
      sourceAgentId: packet.agentId,
      signalType: form.signalType,
      referenceId: form.referenceId.trim(),
      isVerified: form.isVerified,
      summary: form.summary.trim(),
      // The capture happens at click time — a real moment, not a pure render.
      capturedAt: new Date().toISOString(),
      ...(amountCents !== undefined ? { amountCents } : {}),
    };

    const intake = buildCashSignalIntake(input);
    const validation = validateCashSignalIntake(intake);
    if (!validation.valid) {
      setResults((prev) => ({ ...prev, [packet.packetId]: { ok: false, errors: validation.errors } }));
      return;
    }
    setResults((prev) => ({
      ...prev,
      [packet.packetId]: { ok: true, intake, summary: summarizeCapturedSignal(intake) },
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium">
          Aucun envoi automatique · aucun Stripe live · aucune DB · tout reste local à cette session.
        </span>
      </div>

      <p className="text-[11px] text-neutral-500">
        {packets.length} packet{packets.length > 1 ? "s" : ""} préparé{packets.length > 1 ? "s" : ""} par les agents · généré {generatedAt}
      </p>

      {packets.map((packet) => {
        const decision = decisionOf(packet.packetId);
        const form = formOf(packet);
        const result = results[packet.packetId];

        return (
          <article
            key={packet.packetId}
            className="flex flex-col gap-4 rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5"
          >
            {/* Header: buyer + decision state */}
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

            {/* Pain / offer / CTA */}
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

            {/* Outreach draft (draft only, copyable, never sent) */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Outreach draft — copy & send yourself
                </span>
                <button
                  type="button"
                  onClick={() => copyDraft(packet)}
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

            {/* Decision buttons */}
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

            {/* Signal capture — available once approved */}
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
                    onClick={() => recordSignal(packet)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Record signal (local)
                  </button>
                </div>

                {/* Result: errors or the captured-proof summary */}
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
