// src/core/ventures/venture-market-profile.ts
//
// Generic, workspace-agnostic venture model. A venture declares its MARKET,
// compliance drivers, OFFER, ideal customer, and OUTREACH strategy AS DATA —
// never as bespoke code. A Quebec venture lists Loi 25 / Loi 96; a French one
// would list the RGPD; a US one HIPAA. The core knows the shape; the venture
// config owns the values. No proper nouns live here.
//
// This replaces per-venture hard-coded pipelines (e.g. the loi96-* modules):
// those collapse into a VentureMarketProfile config entry + the generic
// outreach builder.

/** Where a venture operates and in what language it speaks. */
export type VentureMarket = {
  /** ISO 3166-1 alpha-2 country, e.g. "CA". */
  country: string;
  /** Sub-national region when relevant, e.g. "QC". */
  region?: string;
  /** BCP-47 primary language for outreach, e.g. "fr". */
  language: string;
};

/**
 * A regulatory / market driver that creates the pain the venture sells against.
 * Examples a venture might declare: Loi 25 (CAI), Loi 96 (OQLF), RGPD (CNIL),
 * HIPAA. Pure data — the core never names any of them.
 */
export type ComplianceDriver = {
  /** Slug, e.g. "loi-96". */
  id: string;
  /** Human label, e.g. "Loi 96 (Charte de la langue française)". */
  label: string;
  /** Enforcing authority, e.g. "OQLF". */
  authority?: string;
  /** ISO date the obligation became enforceable. */
  since?: string;
  note?: string;
};

export type VentureOfferPricingOption = {
  id: string;
  label: string;
  model: "fixed" | "subscription" | "usage" | "custom";
  summary: string;
};

export type VentureOffer = {
  /** What the venture fundamentally sells (positioning). */
  sell: string;
  /** The no-friction deliverable that opens the conversation. */
  deliverable: string;
  /** The conversion next step. */
  nextStep: string;
  pricingOptions: VentureOfferPricingOption[];
  /** Mandatory legal/ethical disclaimer appended to every outreach. */
  disclaimer: string;
  /** Hard claims the offer must NEVER make (guardrails). */
  neverClaims: string[];
};

export type VentureIcp = {
  /** Human description of who the venture targets. */
  description: string;
  /** Structured qualifiers (free-form) used by scouts to find/score targets. */
  qualifiers?: Record<string, string>;
};

export type OutreachMode = "template" | "llm";

/** A subject/body pair that may contain {{placeholder}} tokens. */
export type VentureOutreachTemplate = {
  subject: string;
  body: string;
};

export type VentureOutreachStrategy = {
  channel: "email" | "sms";
  language: string;
  tone: string;
  /**
   * "template" interpolates `template` deterministically (CEO reviews every
   * word before sending). "llm" lets an agent generate from venture context —
   * the body builder is swapped without touching the bridge.
   */
  mode: OutreachMode;
  /** Required when mode is "template". */
  template?: VentureOutreachTemplate;
};

export type VentureMarketProfile = {
  ventureId: string;
  displayName: string;
  market: VentureMarket;
  complianceDrivers: ComplianceDriver[];
  offer: VentureOffer;
  icp: VentureIcp;
  outreach: VentureOutreachStrategy;
};

/**
 * One prospect for a venture's outreach pipeline. Generic across ventures —
 * the venture-specific personalization lives in `angle`.
 */
export type OutreachTarget = {
  /** Stable id within the venture (e.g. a domain or company slug). */
  id: string;
  /** Company / prospect display name. */
  name: string;
  /** Primary contact (email or phone) when known. */
  contact?: string;
  /** The venture-relevant identifier shown in copy (e.g. a website/domain). */
  reference?: string;
  /** Personalization hook — the specific finding/angle for this target. */
  angle?: string;
};
