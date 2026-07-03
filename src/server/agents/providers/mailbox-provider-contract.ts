// src/server/agents/providers/mailbox-provider-contract.ts
//
// Tool Universe Corridor — AgentMail-CLASS mailbox providers (no AgentMail
// dependency, no proper nouns). A mailbox gives an agent an identity surface
// (its own inbox); this contract keeps that surface isolated, inbound
// content untrusted, and outbound under the corridor rule.
//
// RULES (ADR-001 §2/§3, Master Brief §6):
//   * Inbox isolated per workspace/namespace — one agent's compromise never
//     reaches another's identity.
//   * Outbound ONLY via an explicit skillId (→ Sentinelle → Line → Ledger).
//   * Auto-send exists only inside an ACTIVE autonomy line (the reversible
//     auto-execute lane; "A3" in the Master Brief §8 naming) AND with a
//     Sentinelle ALLOW. Everything else is prepared, never sent.
//   * A positive reply becomes a DecisionSignal — information for the spine,
//     NEVER an instruction to the agent.
//   * Ambiguity → CEO handoff. Fail-safe closes toward the human.

import type { AdapterProviderDescriptor } from "./adapter-provider-contract.ts";

export type MailboxNamespace = {
  workspaceId: string;
  /** Per-agent namespace inside the workspace, e.g. "hermes". */
  namespace: string;
};

export type MailboxProviderContract = {
  descriptor: AdapterProviderDescriptor & { adapterKind: "mailbox_provider" };
  inbox: MailboxNamespace;
  outbound: {
    /** Literal: there is no outbound path that is not a skillId. */
    viaSkillIdOnly: true;
    /** Literal: auto-send requires an active autonomy line; no line, no auto. */
    autoSendRequiresActiveLine: true;
  };
  inbound: {
    /** Literal: mail content is untrusted input, never instructions. */
    contentTrust: "untrusted";
  };
};

// ---------------------------------------------------------------------------
// Inbound routing (pure)
// ---------------------------------------------------------------------------

export type InboundReplyClassification =
  | "positive"
  | "negative"
  | "unsubscribe"
  | "unknown";

export type InboundRoute =
  | { route: "decision_signal"; signalKind: string }
  | { route: "ceo_handoff"; reason: string };

/**
 * Pure inbound routing. Positive/negative/unsubscribe become spine signals
 * (facts, not instructions). Anything unknown or ambiguous goes to the CEO —
 * the default arm is a handoff, so new classifications fail safe.
 */
export function routeInboundReply(
  classification: InboundReplyClassification,
): InboundRoute {
  switch (classification) {
    case "positive":
      return { route: "decision_signal", signalKind: "mailbox.reply.positive" };
    case "negative":
      return { route: "decision_signal", signalKind: "mailbox.reply.negative" };
    case "unsubscribe":
      return { route: "decision_signal", signalKind: "mailbox.suppression.requested" };
    default:
      return {
        route: "ceo_handoff",
        reason: "Unclassifiable inbound content — ambiguity routes to the CEO.",
      };
  }
}

// ---------------------------------------------------------------------------
// Outbound gate (pure)
// ---------------------------------------------------------------------------

export type AutoSendContext = {
  /** Is an autonomy line covering this send currently ACTIVE for this agent? */
  lineActive: boolean;
  /** Sentinelle's verdict for the send invocation. */
  sentinelleOutcome: "ALLOW" | "REQUIRE_APPROVAL" | "BLOCK";
};

/**
 * True ONLY when a line is active AND Sentinelle says ALLOW. Every other
 * combination — no line, approval required, block, or anything unforeseen —
 * yields false: the message stays a draft for CEO review.
 */
export function canAutoSend(ctx: AutoSendContext): boolean {
  return ctx.lineActive === true && ctx.sentinelleOutcome === "ALLOW";
}
