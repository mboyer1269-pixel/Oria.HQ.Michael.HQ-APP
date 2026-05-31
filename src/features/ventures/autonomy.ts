import type {
  VentureAutonomyDomain,
  VentureAutonomyProfile,
  VentureAutonomyRule,
} from "./types";

const SAFE_AUTONOMY_DOMAINS: ReadonlySet<VentureAutonomyDomain> = new Set([
  "research",
  "marketScanning",
  "analysis",
  "scoring",
  "reporting",
  "planning",
]);

const DEFAULT_SAFE_AUTONOMY_PROFILE: VentureAutonomyProfile = {
  notes:
    "Default Venture Engine autonomy profile: high autonomy for internal low-risk work; approval gates or hard blocks for risky external, financial, legal, and data mutation domains.",
  rules: [
    {
      domain: "research",
      autonomyLevel: 5,
      riskTier: "safe",
      requiresApproval: false,
      allowedActions: ["gather_public_information", "summarize_sources"],
      blockedActions: ["contact_people", "spend_money"],
    },
    {
      domain: "marketScanning",
      autonomyLevel: 5,
      riskTier: "safe",
      requiresApproval: false,
      allowedActions: ["scan_public_markets", "collect_signals"],
      blockedActions: ["contact_people", "publish_publicly"],
    },
    {
      domain: "analysis",
      autonomyLevel: 5,
      riskTier: "safe",
      requiresApproval: false,
      allowedActions: ["analyze_inputs", "compare_options"],
      blockedActions: ["change_records", "make_commitments"],
    },
    {
      domain: "scoring",
      autonomyLevel: 5,
      riskTier: "safe",
      requiresApproval: false,
      allowedActions: ["score_candidates", "rank_options"],
      blockedActions: ["promote_without_ceo_approval"],
    },
    {
      domain: "reporting",
      autonomyLevel: 5,
      riskTier: "safe",
      requiresApproval: false,
      allowedActions: ["prepare_internal_reports", "summarize_progress"],
      blockedActions: ["publish_publicly"],
    },
    {
      domain: "planning",
      autonomyLevel: 5,
      riskTier: "safe",
      requiresApproval: false,
      allowedActions: ["draft_validation_plan", "prepare_next_steps"],
      blockedActions: ["execute_plan_without_approval"],
    },
    {
      domain: "contentDrafting",
      autonomyLevel: 3,
      riskTier: "controlled",
      requiresApproval: true,
      allowedActions: ["draft_internal_copy", "prepare_content_options"],
      blockedActions: ["publish_publicly", "make_financial_promises"],
    },
    {
      domain: "internalOps",
      autonomyLevel: 3,
      riskTier: "controlled",
      requiresApproval: true,
      allowedActions: ["draft_internal_process", "prepare_operating_checklist"],
      blockedActions: ["delete_data", "change_production_schema"],
    },
    {
      domain: "externalComms",
      autonomyLevel: 2,
      riskTier: "controlled",
      requiresApproval: true,
      allowedActions: ["draft_message", "prepare_outreach_sequence"],
      blockedActions: ["send_message", "contact_customer_without_approval"],
    },
    {
      domain: "publishing",
      autonomyLevel: 2,
      riskTier: "restricted",
      requiresApproval: true,
      allowedActions: ["prepare_publish_draft"],
      blockedActions: ["publish_publicly_without_approval"],
    },
    {
      domain: "spending",
      autonomyLevel: 0,
      riskTier: "forbidden",
      requiresApproval: true,
      allowedActions: [],
      blockedActions: ["spend_money", "buy_tools", "launch_ads"],
      maxBudgetCents: 0,
    },
    {
      domain: "dataMutation",
      autonomyLevel: 0,
      riskTier: "forbidden",
      requiresApproval: true,
      allowedActions: [],
      blockedActions: ["delete_data", "change_production_database", "change_schema"],
    },
    {
      domain: "legalCommitment",
      autonomyLevel: 0,
      riskTier: "forbidden",
      requiresApproval: true,
      allowedActions: [],
      blockedActions: ["sign_contract", "make_legal_commitment", "make_financial_promise"],
    },
  ],
};

function findRule(
  profile: VentureAutonomyProfile,
  domain: VentureAutonomyDomain,
): VentureAutonomyRule | undefined {
  return profile.rules.find((rule) => rule.domain === domain);
}

export function isSafeAutonomyRule(rule: VentureAutonomyRule): boolean {
  return (
    SAFE_AUTONOMY_DOMAINS.has(rule.domain) &&
    rule.riskTier === "safe" &&
    rule.requiresApproval === false &&
    rule.autonomyLevel >= 4
  );
}

export function requiresApprovalForDomain(
  profile: VentureAutonomyProfile,
  domain: VentureAutonomyDomain,
): boolean {
  return findRule(profile, domain)?.requiresApproval ?? true;
}

export function getAutonomyLevelForDomain(
  profile: VentureAutonomyProfile,
  domain: VentureAutonomyDomain,
): number {
  return findRule(profile, domain)?.autonomyLevel ?? 0;
}

export function getDefaultSafeAutonomyProfile(): VentureAutonomyProfile {
  return {
    ...DEFAULT_SAFE_AUTONOMY_PROFILE,
    rules: DEFAULT_SAFE_AUTONOMY_PROFILE.rules.map((rule) => ({
      ...rule,
      allowedActions: [...rule.allowedActions],
      blockedActions: [...rule.blockedActions],
    })),
  };
}
