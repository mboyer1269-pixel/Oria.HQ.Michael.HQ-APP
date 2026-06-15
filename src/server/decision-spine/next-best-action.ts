// src/server/decision-spine/next-best-action.ts
//
// P3a — Decision Spine / NextBestAction (pure, deterministic engine).
//
// Answers "what is THE next action?" by applying ordered, deterministic rules
// over a read-only snapshot of signals (loi96 pipeline, Send Desk queue, ledger).
// Rules first — no LLM, no I/O, no internal clock. `snapshot.now` is the ONLY
// source of time; date math uses Date.UTC over provided strings (pure arithmetic,
// never reads the system clock).
//
// Hard boundaries (P3a):
//   * PURE: no filesystem, no network, no Date.now()/argless new Date().
//   * SUGGESTION-ONLY: every action is advisory or routes to a CEO click. The
//     engine never sends, executes, persists, or mutates anything.
//   * No Supabase, no Cost Ladder, no providers, no persisted event-schema
//     coupling. `DecisionEvent` is an in-memory provenance record — NOT an
//     EventRecord, never written anywhere by this module.

// ---------------------------------------------------------------------------
// Signals (input)
// ---------------------------------------------------------------------------

export type DecisionSignalKind =
  | "loi96.reply.awaiting"
  | "loi96.relance.due"
  | "loi96.prepare.candidate"
  | "send_desk.queue"
  | "loi96.kill_metric"
  | "ledger.recent"
  | "decision.none";

/** One normalized, read-only fact cited by an action's justification. */
export type DecisionSignal = {
  /** Stable id `${kind}:${subject}` — never random, never time-based. */
  id: string;
  kind: DecisionSignalKind;
  /** Stable subject: a target domain, "send_desk", or "global". */
  subject: string;
  /** One line, human-readable — feeds the "signal" line of the reason. */
  label: string;
  /** Optional numeric the rule compared (days since sent, queue size, rate). */
  value?: number;
  /** Optional ISO date the fact derives from (sentDate, replyDate, now). */
  observedAt?: string;
};

/** Minimal read-only projection of one loi96 target (no store coupling). */
export type Loi96TargetSignal = {
  domain: string;
  name: string;
  tier: number;
  status: string;
  hasEmail: boolean;
  sentDate: string | null;
  replyDate: string | null;
  outboundActionId: string | null;
};

/** The complete read-only snapshot the pure engine consumes. */
export type DecisionSignalSnapshot = {
  /** Injected ISO clock — the ONLY source of "now" in the engine. */
  now: string;
  loi96: {
    present: boolean;
    weeklyGoalAuditsSent: number;
    killMetrics: readonly string[];
    targets: readonly Loi96TargetSignal[];
  };
  sendDesk: {
    queuedCount: number;
    queuedActionIds: readonly string[];
  };
  ledger: {
    recent: readonly { actionType: string; summary: string; createdAt: string }[];
  };
};

// ---------------------------------------------------------------------------
// Output (recommendations)
// ---------------------------------------------------------------------------

export type DecisionPriority = "critical" | "high" | "medium" | "low";

export type DecisionRuleId =
  | "reply_awaiting"
  | "relance_due"
  | "send_desk_empty"
  | "kill_metric_watch"
  | "zero_state";

export type NextBestActionSafety = "suggestion_only" | "requires_ceo_click";

/** The 3-line justification: signal -> rule -> action. */
export type NextBestActionReason = {
  signal: string;
  rule: string;
  action: string;
  sourceSignals: readonly DecisionSignal[];
};

export type NextBestAction = {
  /** Stable id `nba:${ruleId}:${subject}` — deterministic, dedup-friendly. */
  id: string;
  title: string;
  summary: string;
  priority: DecisionPriority;
  ruleId: DecisionRuleId;
  reason: NextBestActionReason;
  /** Read-only deep link. The CEO click in the HQ stays the only trigger. */
  cta: { label: string; href: string };
  safety: NextBestActionSafety;
};

export type NextBestActionResult = {
  /** Echo of snapshot.now — never Date.now(). */
  generatedAt: string;
  /** Ranked (highest priority first) and deduped by id. */
  actions: readonly NextBestAction[];
  /** The single highlighted action for the cockpit (actions[0] ?? null). */
  highlighted: NextBestAction | null;
  /** True when the only action is the honest zero-state. */
  isZeroState: boolean;
};

/** In-memory provenance of one engine run. NOT a persisted EventRecord. */
export type DecisionEvent = {
  id: string;
  generatedAt: string;
  topActionId: string | null;
  actionIds: readonly string[];
  ruleIdsFired: readonly DecisionRuleId[];
};

/** Tunable constants — no hidden magic. */
export type DecisionSpineConfig = {
  relanceFirstDays: number;
  relanceSecondDays: number;
  killAuditSample: number;
  killMinReplyRate: number;
};

export const DEFAULT_DECISION_SPINE_CONFIG: DecisionSpineConfig = {
  relanceFirstDays: 4,
  relanceSecondDays: 9,
  killAuditSample: 40,
  killMinReplyRate: 0.02,
};

// ---------------------------------------------------------------------------
// Internal constants + pure helpers
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<DecisionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const RULE_RANK: Record<DecisionRuleId, number> = {
  reply_awaiting: 0,
  relance_due: 1,
  send_desk_empty: 2,
  kill_metric_watch: 3,
  zero_state: 4,
};

const LOI96_PIPELINE_HREF = "/hq/ventures/loi96";
const SEND_DESK_HREF = "/hq/outbound";

/** Statuses that count as "an audit was sent" (or progressed past send). */
const SENT_OR_BEYOND = new Set(["sent", "replied", "call_booked", "signed"]);
/** Statuses that count as a real reply/engagement. */
const REPLIED_OR_BEYOND = new Set(["replied", "call_booked", "signed"]);
/** Terminal statuses — never actionable for preparation. */
const TERMINAL = new Set(["signed", "lost"]);

/** Parse YYYY-MM-DD (or ISO prefix) to whole UTC days. Pure; null if invalid. */
function toUtcDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

/** Whole-day difference toIso - fromIso (date granularity). Null if unparsable. */
function daysBetween(fromIso: string, toIso: string): number | null {
  const from = toUtcDay(fromIso);
  const to = toUtcDay(toIso);
  if (from === null || to === null) return null;
  return to - from;
}

type PrepareStep = "prepare" | "rebuild_audit" | "find_contact";

function prepareStepFor(target: Loi96TargetSignal): PrepareStep {
  if (target.status === "audit_ready" && target.hasEmail) return "prepare";
  if (!target.hasEmail || target.status === "to_verify") return "find_contact";
  if (target.status === "audit_to_rebuild") return "rebuild_audit";
  return "find_contact";
}

function readinessRank(target: Loi96TargetSignal): number {
  const step = prepareStepFor(target);
  if (step === "prepare") return 0;
  if (step === "rebuild_audit") return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Rules (deterministic, ordered)
// ---------------------------------------------------------------------------

// Rule 2 — a prospect reply not yet converted is the top revenue lever.
function ruleReplyAwaiting(snapshot: DecisionSignalSnapshot): NextBestAction[] {
  return snapshot.loi96.targets
    .filter((target) => target.status === "replied")
    .map((target): NextBestAction => {
      const signal: DecisionSignal = {
        id: `loi96.reply.awaiting:${target.domain}`,
        kind: "loi96.reply.awaiting",
        subject: target.domain,
        label: `${target.name} (${target.domain}) a répondu${
          target.replyDate ? ` le ${target.replyDate}` : ""
        } et n'est pas encore converti en appel.`,
        observedAt: target.replyDate ?? snapshot.now,
      };
      return {
        id: `nba:reply_awaiting:${target.domain}`,
        title: `Réponds à ${target.name} maintenant`,
        summary: `${target.name} a répondu — la vitesse de ta réponse est le premier levier de conversion.`,
        priority: "critical",
        ruleId: "reply_awaiting",
        reason: {
          signal: signal.label,
          rule: "reply_awaiting — une réponse non convertie en appel/signature est la priorité absolue (levier « < 2 h », doctrine revenue lane).",
          action: "Réponds, propose un appel, puis marque « Appel booké » dans le pipeline.",
          sourceSignals: [signal],
        },
        cta: { label: "Ouvrir le pipeline Loi 96", href: LOI96_PIPELINE_HREF },
        safety: "requires_ceo_click",
      };
    });
}

// Rule 1 — a sent audit with no reply is due for a follow-up at J+4 (then J+9).
function ruleRelanceDue(
  snapshot: DecisionSignalSnapshot,
  config: DecisionSpineConfig,
): NextBestAction[] {
  const actions: NextBestAction[] = [];
  for (const target of snapshot.loi96.targets) {
    if (target.status !== "sent") continue;
    if (target.replyDate !== null) continue;
    if (target.sentDate === null) continue;
    const days = daysBetween(target.sentDate, snapshot.now);
    if (days === null || days < config.relanceFirstDays) continue;
    const escalated = days >= config.relanceSecondDays;
    const signal: DecisionSignal = {
      id: `loi96.relance.due:${target.domain}`,
      kind: "loi96.relance.due",
      subject: target.domain,
      label: `Audit envoyé à ${target.name} il y a ${days} jour(s), aucune réponse.`,
      value: days,
      observedAt: target.sentDate,
    };
    actions.push({
      id: `nba:relance_due:${target.domain}`,
      title: `Relance ${target.name} (J+${days})`,
      summary: `${target.name} n'a pas répondu depuis ${days} jour(s) — ${
        escalated ? "dernière relance" : "relance de suivi"
      }.`,
      priority: "high",
      ruleId: "relance_due",
      reason: {
        signal: signal.label,
        rule: `relance_due — relance due à J+${config.relanceFirstDays}${
          escalated ? ` ; escalade à J+${config.relanceSecondDays}` : ""
        }.`,
        action: `Prépare la relance ${escalated ? "#2 (dernière)" : "#1"} pour ${target.name} au Send Desk.`,
        sourceSignals: [signal],
      },
      cta: { label: "Ouvrir le pipeline Loi 96", href: LOI96_PIPELINE_HREF },
      safety: "requires_ceo_click",
    });
  }
  return actions;
}

// Rule 3 — an empty Send Desk means the next revenue move is to prepare a target.
function ruleSendDeskEmpty(snapshot: DecisionSignalSnapshot): NextBestAction[] {
  if (snapshot.sendDesk.queuedCount > 0) return [];

  const preparable = snapshot.loi96.targets.filter(
    (target) =>
      !TERMINAL.has(target.status) &&
      target.outboundActionId === null &&
      !SENT_OR_BEYOND.has(target.status),
  );
  if (preparable.length === 0) return [];

  const ranked = [...preparable].sort((left, right) => {
    if (left.tier !== right.tier) return left.tier - right.tier;
    const byReadiness = readinessRank(left) - readinessRank(right);
    if (byReadiness !== 0) return byReadiness;
    return left.domain < right.domain ? -1 : left.domain > right.domain ? 1 : 0;
  });
  const top = ranked[0];
  const step = prepareStepFor(top);

  const stepCopy: Record<PrepareStep, { title: string; action: string }> = {
    prepare: {
      title: `Prépare l'audit de ${top.name}`,
      action: `Clique « Préparer » sur ${top.name} : l'audit part au Send Desk, prêt pour ton envoi.`,
    },
    rebuild_audit: {
      title: `Régénère l'audit de ${top.name}`,
      action: `Régénère l'audit perdu de ${top.name} (T${top.tier}) pour débloquer le premier envoi.`,
    },
    find_contact: {
      title: `Trouve le courriel de ${top.name}`,
      action: `Ajoute un courriel direct pour ${top.name} avant de pouvoir préparer l'envoi.`,
    },
  };

  const queueSignal: DecisionSignal = {
    id: "send_desk.queue:empty",
    kind: "send_desk.queue",
    subject: "send_desk",
    label: "La file d'envoi (Send Desk) est vide.",
    value: 0,
  };
  const targetSignal: DecisionSignal = {
    id: `loi96.prepare.candidate:${top.domain}`,
    kind: "loi96.prepare.candidate",
    subject: top.domain,
    label: `${top.name} (T${top.tier}) — statut « ${top.status} »${
      top.hasEmail ? ", courriel direct présent" : ", pas de courriel direct"
    }.`,
  };

  return [
    {
      id: "nba:send_desk_empty:global",
      title: stepCopy[step].title,
      summary: `File d'envoi vide — ${preparable.length} cible(s) en attente. Prochaine : ${top.name}.`,
      priority: "high",
      ruleId: "send_desk_empty",
      reason: {
        signal: `${queueSignal.label} ${preparable.length} cible(s) préparable(s).`,
        rule: "send_desk_empty — file vide ⇒ la prochaine action revenue est de préparer la meilleure cible (tier puis état d'audit).",
        action: stepCopy[step].action,
        sourceSignals: [queueSignal, targetSignal],
      },
      cta: { label: "Ouvrir le pipeline Loi 96", href: LOI96_PIPELINE_HREF },
      safety: "requires_ceo_click",
    },
  ];
}

// Rule 4 — reply rate under the kill threshold over a meaningful sample.
function ruleKillMetricWatch(
  snapshot: DecisionSignalSnapshot,
  config: DecisionSpineConfig,
): NextBestAction[] {
  const targets = snapshot.loi96.targets;
  const auditsSent = targets.filter((target) => SENT_OR_BEYOND.has(target.status)).length;
  if (auditsSent < config.killAuditSample) return [];
  const replies = targets.filter((target) => REPLIED_OR_BEYOND.has(target.status)).length;
  const replyRate = replies / auditsSent;
  if (replyRate >= config.killMinReplyRate) return [];

  const citedMetric =
    snapshot.loi96.killMetrics.find((metric) => metric.includes("%") || /r[ée]ponse/i.test(metric)) ??
    snapshot.loi96.killMetrics[0] ??
    null;

  const ratePct = (replyRate * 100).toFixed(1);
  const thresholdPct = (config.killMinReplyRate * 100).toFixed(0);
  const signal: DecisionSignal = {
    id: "loi96.kill_metric:reply_rate",
    kind: "loi96.kill_metric",
    subject: "global",
    label: `${replies} réponse(s) sur ${auditsSent} audits envoyés (${ratePct} %), sous le seuil de ${thresholdPct} %.`,
    value: replyRate,
  };
  return [
    {
      id: "nba:kill_metric_watch:reply_rate",
      title: "Taux de réponse sous le seuil kill",
      summary: `Réponse à ${ratePct} % sur ${auditsSent} audits — revois ciblage ou message avant d'en envoyer plus.`,
      priority: "medium",
      ruleId: "kill_metric_watch",
      reason: {
        signal: signal.label,
        rule: `kill_metric_watch — taux de réponse sous le seuil kill${
          citedMetric ? ` (« ${citedMetric} »)` : ""
        }.`,
        action: "Revois le ciblage ou le message ; ne lance pas plus d'envois tant que le taux ne remonte pas.",
        sourceSignals: [signal],
      },
      cta: { label: "Ouvrir le pipeline Loi 96", href: LOI96_PIPELINE_HREF },
      safety: "suggestion_only",
    },
  ];
}

// Rule 5 — honest zero-state when no rule produced an action. Stays truthful
// about pending Send Desk work instead of claiming "nothing to do".
function ruleZeroState(snapshot: DecisionSignalSnapshot): NextBestAction {
  if (snapshot.sendDesk.queuedCount > 0) {
    const pendingSignal: DecisionSignal = {
      id: "send_desk.queue:pending",
      kind: "send_desk.queue",
      subject: "send_desk",
      label: `${snapshot.sendDesk.queuedCount} envoi(s) prêt(s) au Send Desk, en attente de ton clic.`,
      value: snapshot.sendDesk.queuedCount,
    };
    return {
      id: "nba:zero_state:send_desk",
      title: `Envoie tes ${snapshot.sendDesk.queuedCount} action(s) prête(s)`,
      summary: "Aucun nouveau signal des règles — mais des envois t'attendent au Send Desk.",
      priority: "low",
      ruleId: "zero_state",
      reason: {
        signal: pendingSignal.label,
        rule: "zero_state — aucune règle revenue n'a produit de nouvelle action ; le Send Desk a des envois prêts.",
        action: "Ouvre le Send Desk et envoie (ou révise) les actions déjà préparées.",
        sourceSignals: [pendingSignal],
      },
      cta: { label: "Ouvrir le Send Desk", href: SEND_DESK_HREF },
      safety: "requires_ceo_click",
    };
  }

  const emptySignal: DecisionSignal = {
    id: "decision.none:global",
    kind: "decision.none",
    subject: "global",
    label: "Aucun signal actionnable dans le pipeline ni la file d'envoi.",
  };
  return {
    id: "nba:zero_state:global",
    title: "Débloque la prochaine cible",
    summary: "Rien d'urgent — fais avancer une cible pour réamorcer la boucle revenue.",
    priority: "low",
    ruleId: "zero_state",
    reason: {
      signal: emptySignal.label,
      rule: "zero_state — aucune règle n'a produit d'action ; voici la relance honnête.",
      action: "Vérifie le contact d'une cible « à vérifier » ou régénère un audit pour préparer un envoi.",
      sourceSignals: [emptySignal],
    },
    cta: { label: "Ouvrir le pipeline Loi 96", href: LOI96_PIPELINE_HREF },
    safety: "suggestion_only",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pure decision engine. Applies the v1 rules over a read-only snapshot and
 * returns ranked, deduped NextBestActions. Deterministic: same snapshot +
 * config always yields the same result. No I/O, no clock.
 */
export function computeNextBestActions(
  snapshot: DecisionSignalSnapshot,
  config: Partial<DecisionSpineConfig> = {},
): NextBestActionResult {
  const cfg: DecisionSpineConfig = { ...DEFAULT_DECISION_SPINE_CONFIG, ...config };

  const collected: NextBestAction[] = [
    ...ruleReplyAwaiting(snapshot),
    ...ruleRelanceDue(snapshot, cfg),
    ...ruleSendDeskEmpty(snapshot),
    ...ruleKillMetricWatch(snapshot, cfg),
  ];

  // Dedup by stable id (deterministic ids guarantee idempotent runs).
  const byId = new Map<string, NextBestAction>();
  for (const action of collected) {
    if (!byId.has(action.id)) byId.set(action.id, action);
  }
  let actions = [...byId.values()];

  const isZeroState = actions.length === 0;
  if (isZeroState) actions = [ruleZeroState(snapshot)];

  actions.sort((left, right) => {
    const byPriority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (byPriority !== 0) return byPriority;
    const byRule = RULE_RANK[left.ruleId] - RULE_RANK[right.ruleId];
    if (byRule !== 0) return byRule;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  return {
    generatedAt: snapshot.now,
    actions,
    highlighted: actions.length > 0 ? actions[0] : null,
    isZeroState,
  };
}

/**
 * Builds an in-memory provenance record of one engine run. Pure and
 * deterministic — NOT a persisted EventRecord, never written anywhere here.
 */
export function buildDecisionEvent(result: NextBestActionResult): DecisionEvent {
  const ruleIdsFired: DecisionRuleId[] = [];
  for (const action of result.actions) {
    if (!ruleIdsFired.includes(action.ruleId)) ruleIdsFired.push(action.ruleId);
  }
  return {
    id: `decision:${result.generatedAt}`,
    generatedAt: result.generatedAt,
    topActionId: result.highlighted ? result.highlighted.id : null,
    actionIds: result.actions.map((action) => action.id),
    ruleIdsFired,
  };
}
