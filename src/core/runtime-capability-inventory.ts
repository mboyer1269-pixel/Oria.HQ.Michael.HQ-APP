// src/core/runtime-capability-inventory.ts
//
// The single hand-authored inventory of executors reachable in this runtime,
// the effect each produces, and the gate standing in front of it. The cockpit
// renders it; runtime-capability-inventory.test.mjs enforces its completeness
// against the real executor registries and route surfaces.
//
// An entry claims nothing on its own authority: each carries a file and a
// marker that must be present for the claim to hold.
//
// Pure data. No imports, no I/O.

/** What actually happens when a capability runs. */
export const RUNTIME_EFFECTS = ["none", "internal_write", "external_call"] as const;
export type RuntimeEffect = (typeof RUNTIME_EFFECTS)[number];

/**
 * What must clear before a capability can run.
 *
 *   ceo_approval           — an explicit human approval on a queued intent.
 *   owner_confirmed        — an owner session plus a per-action confirmation
 *                            (approval token, confirm flag) on the request.
 *   owner_session          — an owner session only. The effect follows from the
 *                            request or the page render, with no per-action
 *                            confirmation.
 *   sentinelle_green_lane  — an owner-authenticated request the Sentinelle
 *                            zones green; no approval packet.
 *   scheduled_pass         — a background pass; no per-action human decision.
 *   public_unauthenticated — reachable without any session.
 */
export const RUNTIME_GATES = [
  "ceo_approval",
  "owner_confirmed",
  "owner_session",
  "sentinelle_green_lane",
  "scheduled_pass",
  "public_unauthenticated",
] as const;
export type RuntimeGate = (typeof RUNTIME_GATES)[number];

/** Gates that route an action through the approval rail before it can run. */
export const APPROVAL_RAIL_GATES: readonly RuntimeGate[] = ["ceo_approval"];

export type RuntimeCapabilityEvidence = {
  /** Repo-relative file that proves the capability exists as described. */
  path: string;
  /** Substring that must appear in that file. */
  mustContain: string;
  /** Why this proves it — read by whoever hits the failure. */
  because: string;
};

export type RuntimeCapability = {
  id: string;
  label: string;
  /**
   * The executor registry key this maps to: a skill id for a built-in handler,
   * an MCP tool name, or a route path for an executor reached directly.
   * `null` means the capability covers no single registry key.
   */
  executorKey: string | null;
  effect: RuntimeEffect;
  gate: RuntimeGate;
  detail: string;
  evidence: RuntimeCapabilityEvidence;
};

/**
 * Every executor reachable in this runtime today, ordered by decreasing
 * consequence.
 */
export const RUNTIME_CAPABILITIES: readonly RuntimeCapability[] = [
  {
    id: "contact_form_email",
    label: "Formulaire de contact · courriel Resend",
    executorKey: "/api/contact",
    effect: "external_call",
    gate: "public_unauthenticated",
    detail:
      "Une soumission publique déclenche un envoi Resend réel. Aucune session requise ; seule une limite par IP la borne.",
    evidence: {
      path: "src/server/contact/contact-notification-service.ts",
      mustContain: "resend.emails.send",
      because:
        "The notification service sends through Resend. The contact route is unauthenticated, so this is the only executor a stranger can reach.",
    },
  },
  {
    id: "outbound_send_email",
    label: "Envoi sortant · courriel Resend",
    executorKey: "/api/outbound/send",
    effect: "external_call",
    gate: "owner_confirmed",
    detail:
      "Envoi réel d'un courriel approuvé. Session propriétaire plus un approvalToken qui doit correspondre au contenu approuvé.",
    evidence: {
      path: "src/server/outbound/outbound-executor-live.ts",
      mustContain: "ports.channelSend.send(",
      because:
        "The live bridge reaches the channel adapter, which is the Resend client. Every guardrail runs upstream of that call.",
    },
  },
  {
    id: "n8n_webhook_dispatch",
    label: "Dispatch n8n · rail d'intents",
    executorKey: "n8n_webhook_trigger",
    effect: "external_call",
    gate: "ceo_approval",
    detail:
      "Envoi HMAC signé vers n8n. Déclenché uniquement par la route d'approbation CEO, jamais par l'évaluation automatique.",
    evidence: {
      path: "src/app/api/agents/execution-intents/[intentId]/approve/route.ts",
      mustContain: "tool.handler(intent.payload",
      because:
        "The approve route is the only caller of the dispatch tool. Another caller would mean this gate is no longer ceo_approval.",
    },
  },
  {
    id: "green_lane_content_generate",
    label: "Voie verte · content.generate",
    executorKey: "content.generate",
    effect: "external_call",
    gate: "sentinelle_green_lane",
    detail:
      "Handler in-process appelant une API de modèle (Anthropic/OpenAI). Passe par la Sentinelle et le ledger, pas par le rail d'approbation.",
    evidence: {
      path: "src/server/runtime/skill-dispatcher.ts",
      mustContain: '"content.generate": handleContentGenerate',
      because:
        "The built-in handler map is what makes this skill execute instead of previewing.",
    },
  },
  {
    id: "shadow_pass_scoring",
    label: "Mode Ombre · scoring planifié",
    executorKey: "shadow_pass",
    effect: "external_call",
    gate: "scheduled_pass",
    detail:
      "Chaque passe appelle un fournisseur IA (coût par exécution) puis vérifie les URLs citées sur le réseau. N'agit pas sur les ventures : la sortie est une proposition écrite au ledger.",
    evidence: {
      path: "src/server/ventures/venture-score-shadow-runner.ts",
      mustContain: "generateStructuredJson",
      because:
        "The pass calls a model provider on every run, then fetches the cited URLs. Its writes are internal; its calls are not.",
    },
  },
  {
    id: "calendar_event_write",
    label: "Calendrier · création d'événement",
    executorKey: "/api/calendar/events",
    effect: "internal_write",
    gate: "owner_confirmed",
    detail:
      "Écriture persistante d'un événement. Session propriétaire plus un drapeau de confirmation explicite ; le ledger est écrit avant et après.",
    evidence: {
      path: "src/server/calendar/calendar-service.ts",
      mustContain: "calendarRepository.create(",
      because:
        "The service persists the event through the repository. The write is internal, and its precondition is a confirmed owner request.",
    },
  },
  {
    id: "joris_reply_generation",
    label: "Joris · génération de réponse",
    executorKey: "/api/joris/chat",
    effect: "external_call",
    gate: "owner_session",
    detail:
      "Chaque message envoyé appelle un fournisseur de modèle. Coût par échange ; le contenu du message part chez le fournisseur.",
    evidence: {
      path: "src/server/joris/joris-reply-generator.ts",
      mustContain: "generateStructuredJson",
      because:
        "The reply generator calls a model provider on every turn. An owner session is the only gate on the chat route.",
    },
  },
  {
    id: "daily_direction_generation",
    label: "Cockpit · direction du jour",
    executorKey: "generateDailyDirectionAction",
    effect: "external_call",
    gate: "owner_session",
    detail:
      "Action serveur déclenchée par le propriétaire. Un appel de modèle par génération.",
    evidence: {
      path: "src/server/joris/daily-direction-generator.ts",
      mustContain: "generateStructuredJson",
      because:
        "The generator calls a model provider; the server action gates on an owner session and nothing further.",
    },
  },
  {
    id: "cash_action_packet_generation",
    label: "Ventures · paquet d'actions cash",
    executorKey: "/hq/ventures/cash-actions",
    effect: "external_call",
    gate: "owner_session",
    detail:
      "Génération par appel de modèle au rendu de la page. Aucune confirmation par action : ouvrir la page suffit à engager le coût.",
    evidence: {
      path: "src/features/ventures/llm-cash-action-packet-generator.ts",
      mustContain: "generateStructuredJson",
      because:
        "The packet generator calls a model provider, and the page renders it behind an owner session only.",
    },
  },
  {
    id: "green_lane_dry_run_preview",
    label: "Voie verte · aperçu dry-run",
    executorKey: null,
    effect: "none",
    gate: "sentinelle_green_lane",
    detail:
      "Toute compétence sans handler in-process retourne un aperçu. Aucun effet, aucun appel sortant.",
    evidence: {
      path: "src/server/runtime/skill-dispatcher.ts",
      mustContain: 'strategy: "dry-run"',
      because:
        "The fallback strategy keeps an unimplemented skill inert rather than erroring or improvising.",
    },
  },
];

// ---------------------------------------------------------------------------
// Derived posture
// ---------------------------------------------------------------------------

/**
 * How much the runtime can do without a human decision per action.
 *
 *   locked  — nothing reachable produces an effect.
 *   gated   — effects exist, and every one waits for a CEO approval.
 *   bounded — an effect can occur without traversing the approval rail.
 */
export type RuntimePostureState = "locked" | "gated" | "bounded";

export type RuntimePosture = {
  state: RuntimePostureState;
  /** Short label for the cockpit pill. */
  meta: string;
  /** One sentence naming what produced the state. */
  detail: string;
  /** Capabilities that produce an effect. */
  effectful: readonly RuntimeCapability[];
  /** Effectful capabilities that do NOT traverse the approval rail. */
  ungatedEffects: readonly RuntimeCapability[];
};

/** Whether a gate routes the action through the approval rail. */
export function isApprovalRailGate(gate: RuntimeGate): boolean {
  return APPROVAL_RAIL_GATES.includes(gate);
}

/**
 * Derives the runtime posture from the inventory. Pure and total: it reports
 * what the entries say and cannot express a state they do not support.
 */
export function deriveRuntimePosture(
  capabilities: readonly RuntimeCapability[] = RUNTIME_CAPABILITIES,
): RuntimePosture {
  const effectful = capabilities.filter((capability) => capability.effect !== "none");
  const ungatedEffects = effectful.filter((capability) => !isApprovalRailGate(capability.gate));

  if (effectful.length === 0) {
    return {
      state: "locked",
      meta: "Verrouillé",
      detail: "Aucun exécuteur inventorié ne produit d'effet.",
      effectful,
      ungatedEffects,
    };
  }

  if (ungatedEffects.length === 0) {
    return {
      state: "gated",
      meta: "Sous approbation",
      detail: `${effectful.length} exécuteur(s) à effet, tous derrière une approbation CEO explicite.`,
      effectful,
      ungatedEffects,
    };
  }

  return {
    state: "bounded",
    meta: "Borné",
    detail:
      `${ungatedEffects.length} exécuteur(s) sur ${effectful.length} produisent un effet hors du rail d'approbation ` +
      `(${ungatedEffects.map((capability) => capability.label).join(", ")}).`,
    effectful,
    ungatedEffects,
  };
}
