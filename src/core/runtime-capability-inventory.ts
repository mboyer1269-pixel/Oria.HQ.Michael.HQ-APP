// src/core/runtime-capability-inventory.ts
//
// The hand-authored inventory of executors inside a DECLARED SCOPE, the effect
// each produces, and the gate standing in front of it.
//
// The scope is narrow on purpose, and stated so a count from this module can be
// read correctly: it is not "everything this runtime does". Persistence that an
// owner drives through the application's own screens is out, and listed as such
// in OUT_OF_SCOPE_SURFACES rather than left undetected.
//
// An entry claims nothing on its own authority: each carries a file and a
// marker that must be present for the claim to hold. Completeness is enforced
// by runtime-capability-inventory.test.mjs, which enumerates every outbound
// call and every persistence write in src/ and requires each to be either
// covered by a capability or explicitly out of scope.
//
// Pure data. No imports, no I/O.

/**
 * What this inventory covers, and what it does not.
 *
 * Rendered next to any count derived from it, because a number without its
 * boundary reads as a total.
 */
export const INVENTORY_SCOPE = {
  covers:
    "les effets qui sortent du processus, et les effets qu'un agent ou une planification peut provoquer",
  excludes:
    "la persistance applicative pilotée par le propriétaire depuis les écrans (mise en page, notes, ventures, arène, missions), le journal d'audit lui-même et les utilitaires de développement ou de smoke lancés manuellement",
} as const;

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
  /**
   * Additional files this capability accounts for — the implementation it
   * reaches. Without them the completeness check would report a capability's
   * own repository as an undeclared surface.
   */
  covers?: readonly string[];
};

/**
 * Persistence and mutation surfaces deliberately outside the inventory.
 *
 * Detected by the completeness check and classified here, so "not shown" is a
 * decision on record rather than a gap. A new mutation surface belongs to a
 * capability or to one of these groups; anything else fails CI.
 */
export const OUT_OF_SCOPE_SURFACES: readonly {
  reason: string;
  paths: readonly string[];
}[] = [
  {
    reason:
      "Le journal d'audit lui-même. Chaque capacité écrit à travers lui ; le compter comme un exécuteur le ferait apparaître une fois par capacité.",
    paths: ["src/server/actions/action-ledger-repository.ts"],
  },
  {
    reason:
      "Persistance applicative pilotée par le propriétaire depuis un écran : la requête est une action humaine directe, pas un effet qu'un agent peut provoquer.",
    paths: [
      "src/app/login/actions.ts",
      "src/features/cockpit/actions/cockpit-layout.ts",
      "src/features/cockpit/events/event-client.ts",
      "src/features/cockpit/events/idea-capture-action.ts",
      "src/features/notes/note-action.ts",
      "src/features/ventures/cash-signal-intake-action.ts",
      "src/features/ventures/loi96-pipeline-action.ts",
      "src/features/ventures/venture-asset-action.ts",
      "src/features/ventures/venture-lifecycle-action.ts",
      "src/features/ventures/venture-save-action.ts",
      "src/server/auth/actions.ts",
      "src/server/arena/arena-verdict-repository.ts",
      "src/server/joris/governance-decision-repository.ts",
      "src/server/missions/approval-record-repository.ts",
      "src/server/missions/mission-draft-durable-repository.ts",
      "src/server/ventures/cash-signal-intake-repository.ts",
      "src/server/ventures/venture-repository.ts",
    ],
  },
  {
    reason:
      "Comptabilité de résultat d'une capacité déjà inventoriée : la ligne est écrite après coup et ne déclenche rien.",
    paths: [
      "src/server/ventures/agent-outcome-repository.ts",
      "src/server/ventures/agent-score-snapshot-repository.ts",
    ],
  },
  {
    reason:
      "Proposition en ajout seul : la ligne enregistre une intention et n'exécute jamais.",
    paths: ["src/server/ventures/prepared-action-repository.ts"],
  },
];

/**
 * Calls that leave the process but are not part of the deployed runtime.
 *
 * These exact files are still scanned. The inverse assertion fails if an
 * exclusion disappears or stops containing the effect it was written for, so
 * this list cannot become a filename-shaped blind spot.
 */
export const OUT_OF_SCOPE_EFFECT_SURFACES: readonly {
  reason: string;
  paths: readonly string[];
}[] = [
  {
    reason:
      "Utilitaire développeur lancé explicitement en ligne de commande pour traiter un document et déléguer à Task Master ; aucune route ni aucun agent ne l'appelle.",
    paths: ["src/scripts/process-document.ts"],
  },
  {
    reason:
      "Smoke n8n manuel : il vérifie une URL fournie par l'opérateur et ne fait pas partie du runtime servi par Next.js.",
    paths: ["src/scripts/smoke/n8n-execution-slice.mjs"],
  },
];

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
      "Une soumission publique déclenche un envoi Resend réel et insère une ligne contact_leads. Aucune session requise ; seule une limite par IP la borne.",
    evidence: {
      path: "src/server/contact/contact-notification-service.ts",
      mustContain: "resend.emails.send",
      because:
        "The notification service sends through Resend. The contact route is unauthenticated, so this is the only executor a stranger can reach.",
    },
    covers: ["src/server/contact/contact-lead-repository.ts"],
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
    covers: ["src/server/agents/execution-intent-repository.ts"],
  },
  {
    id: "joris_memex_context_lookup",
    label: "Joris · contexte Memex local",
    executorKey: "enrichJorisMemoryContextWithMemex",
    effect: "external_call",
    gate: "owner_session",
    detail:
      "Quand le pont local est explicitement activé, chaque message Joris peut démarrer le serveur MCP Memex en stdio et y lire du contexte. Le transport reste local et lecture seule.",
    evidence: {
      path: "src/server/mcp/memex-stdio-transport.ts",
      mustContain: "client.callTool(",
      because:
        "The Joris brain reaches this MCP client through memex-context-source. The official stdio transport spawns a local process and calls a read-only Memex tool.",
    },
    covers: [
      "src/server/joris/brain.ts",
      "src/server/joris/memex-context-source.ts",
      "src/server/mcp/memex-readonly-client.ts",
    ],
  },
  {
    id: "joris_public_inventory_sync",
    label: "Joris / Sales · synchronisation d'inventaire public",
    executorKey: "syncPublicInventory",
    effect: "external_call",
    gate: "owner_session",
    detail:
      "Télécharge les pages d'inventaire Buckingham allowlistées. Joris peut le déclencher depuis le chat, tout comme la route propriétaire du Sales Desk.",
    evidence: {
      path: "src/server/inventory/public-inventory-sync.ts",
      mustContain: "fetchImpl(url,",
      because:
        "The sync service performs the injected-or-global fetch. Its callers are owner-authenticated routes and Joris intents behind the owner chat session.",
    },
    covers: [
      "src/app/api/inventory/sync/route.ts",
      "src/server/joris/inventory-market-intent.ts",
      "src/server/joris/marketplace-listing-intent.ts",
      "src/server/joris/sales-marketing-intent.ts",
    ],
  },
  {
    id: "joris_market_advantage_brief",
    label: "Joris / Sales · comparables AutoTrader",
    executorKey: "fetchMarketAdvantageBrief",
    effect: "external_call",
    gate: "owner_session",
    detail:
      "Télécharge une recherche AutoTrader allowlistée pour produire un brief marché. Un message Joris ciblé ou la route propriétaire peut lancer cet appel.",
    evidence: {
      path: "src/server/market/fetch-market-comps.ts",
      mustContain: "fetchImpl(url,",
      because:
        "The market brief service performs the injected-or-global fetch and is called directly by the owner route and by Joris inventory-market intents.",
    },
    covers: [
      "src/app/api/sales/market-brief/route.ts",
      "src/server/joris/inventory-market-intent.ts",
    ],
  },
  {
    id: "joris_marketplace_vdp_enrichment",
    label: "Joris / Marketplace · enrichissement photo VDP",
    executorKey: "prepareMarketplaceListing",
    effect: "external_call",
    gate: "owner_session",
    detail:
      "La préparation d'une fiche Marketplace télécharge par défaut la VDP allowlistée pour compléter ses photos. Joris peut déclencher cette préparation depuis le chat.",
    evidence: {
      path: "src/server/inventory/vdp-photo-enrich.ts",
      mustContain: "fetchImpl(check.normalizedUrl,",
      because:
        "prepareMarketplaceListing calls this injected-or-global fetch by default. Both the API route and the Joris listing intent require the owner session.",
    },
    covers: [
      "src/app/api/marketplace/listings/route.ts",
      "src/server/joris/marketplace-listing-intent.ts",
      "src/server/marketplace-listings/prepare-listing.ts",
    ],
  },
  {
    id: "marketplace_photo_pack_download",
    label: "Marketplace · téléchargement du pack photo",
    executorKey: "/api/marketplace/listings/photo-pack",
    effect: "external_call",
    gate: "owner_session",
    detail:
      "Télécharge jusqu'à 20 images allowlistées et construit un ZIP pour publication manuelle. La route exige la session propriétaire.",
    evidence: {
      path: "src/server/marketplace-listings/build-photo-pack.ts",
      mustContain: "fetchImpl(check.normalizedUrl,",
      because:
        "The photo-pack builder performs one injected-or-global fetch per image and is reached only through the owner-authenticated photo-pack route.",
    },
    covers: ["src/app/api/marketplace/listings/photo-pack/route.ts"],
  },
  {
    id: "local_runtime_status_probe",
    label: "Command Tower · sondes CLI locales",
    executorKey: "probeLocalRuntimes",
    effect: "external_call",
    gate: "owner_session",
    detail:
      "Sur une machine locale autorisée, le rendu Command Tower exécute des commandes de version et de statut d'authentification strictement allowlistées.",
    evidence: {
      path: "src/server/agents/runtimes/local-runtime-probe.ts",
      mustContain: "execFile(",
      because:
        "The owner-only Command Tower source calls probeLocalRuntimes, whose frozen runner invokes these local CLI subprocesses through execFile.",
    },
    covers: ["src/features/hq/command-tower/runtime-status-source.ts"],
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
      mustContain: 'fetch("https://api.anthropic.com/v1/messages"',
      because:
        "The registered content.generate handler reaches this direct model-provider fetch instead of returning the inert dry-run preview.",
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
    covers: ["src/server/ventures/venture-score-shadow-runner.ts"],
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
    covers: ["src/server/calendar/calendar-repository.ts"],
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
    covers: ["src/features/cockpit/events/generate-daily-direction-action.ts"],
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
