// src/features/ventures/venture-asset.ts
//
// Venture Asset Registry — progressive, typed operational details attached to
// a venture card (decision 2026-06-10).
//
// Principle: a venture accumulates operational assets AS IT EARNS THEM —
// nothing is required at creation. Each lifecycle stage recommends (never
// forces) a set of asset kinds. The registry is the single source of truth
// that other systems consume:
//   * Send Desk: an active `dedicated_email` becomes the venture's send
//     identity (reply-to);
//   * Kill: active accounts/domains/subscriptions form the close-out
//     inventory so a killed venture leaves no zombie costs.
//
// Dependency-free pure module (types + projections). Shared by server
// repository, server actions and client UI.

import type { VentureLifecycleStatus } from "./types";

export type VentureAssetKind =
  | "dedicated_email"
  | "domain"
  | "storefront"
  | "payment_account"
  | "social_account"
  | "tool_account"
  | "supplier"
  | "kpi_target"
  | "legal_doc"
  | "note";

export const VENTURE_ASSET_KIND_LABELS: Record<VentureAssetKind, string> = {
  dedicated_email: "Courriel dédié",
  domain: "Domaine",
  storefront: "Boutique / storefront",
  payment_account: "Compte de paiement",
  social_account: "Compte social",
  tool_account: "Outil / abonnement",
  supplier: "Fournisseur",
  kpi_target: "Cible KPI",
  legal_doc: "Document légal",
  note: "Note opérationnelle",
};

/** Kinds that cost money or hold accounts — the close-out inventory on kill. */
export const CLOSEOUT_ASSET_KINDS: readonly VentureAssetKind[] = [
  "dedicated_email",
  "domain",
  "storefront",
  "payment_account",
  "social_account",
  "tool_account",
  "supplier",
];

export type VentureAssetRecord = {
  id: string;
  workspaceId: string;
  ventureId: string;
  kind: VentureAssetKind;
  /** Human label, e.g. "Courriel support clients". */
  label: string;
  /** The value, e.g. "support@maboutique.com" or "shopify — plan Basic". */
  value: string;
  /** Marks credentials-adjacent entries; UI masks the value by default. */
  sensitive: boolean;
  status: "active" | "retired";
  retireReason?: string;
  createdAt: string;
  retiredAt?: string;
};

/** Active view of the registry (retired assets stay in history). */
export function projectActiveAssets(records: VentureAssetRecord[]): VentureAssetRecord[] {
  return records.filter((record) => record.status === "active");
}

// ---------------------------------------------------------------------------
// Stage readiness — recommended (never blocking) asset kinds per lifecycle
// stage. Early stages require NOTHING by design: validate first, equip later.
// ---------------------------------------------------------------------------

const STAGE_RECOMMENDED_KINDS: Partial<Record<VentureLifecycleStatus, VentureAssetKind[]>> = {
  validating: [],
  operating: ["dedicated_email", "payment_account"],
  autonomous: ["dedicated_email", "payment_account", "domain", "kpi_target"],
  scaling: ["dedicated_email", "payment_account", "domain", "kpi_target", "tool_account"],
};

export type VentureReadiness = {
  status: VentureLifecycleStatus;
  recommended: VentureAssetKind[];
  present: VentureAssetKind[];
  missing: VentureAssetKind[];
  /** present / recommended, 1 when nothing is recommended. */
  ratio: number;
};

export function computeVentureReadiness(
  records: VentureAssetRecord[],
  status: VentureLifecycleStatus,
): VentureReadiness {
  const recommended = STAGE_RECOMMENDED_KINDS[status] ?? [];
  const activeKinds = new Set(projectActiveAssets(records).map((record) => record.kind));
  const present = recommended.filter((kind) => activeKinds.has(kind));
  const missing = recommended.filter((kind) => !activeKinds.has(kind));
  return {
    status,
    recommended,
    present,
    missing,
    ratio: recommended.length === 0 ? 1 : present.length / recommended.length,
  };
}

// ---------------------------------------------------------------------------
// Operational consumers
// ---------------------------------------------------------------------------

/**
 * Send identity for the venture: the most recent active dedicated_email.
 * Consumed by the Send Desk (reply-to / from identity).
 */
export function getVentureSendIdentity(records: VentureAssetRecord[]): string | null {
  const emails = projectActiveAssets(records)
    .filter((record) => record.kind === "dedicated_email")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return emails[0]?.value ?? null;
}

/**
 * Close-out inventory on kill/archive: every active asset that holds an
 * account, a domain or a paid subscription. This list is what Michael walks
 * through to shut a venture down cleanly.
 */
export function getCloseoutInventory(records: VentureAssetRecord[]): VentureAssetRecord[] {
  return projectActiveAssets(records).filter((record) =>
    CLOSEOUT_ASSET_KINDS.includes(record.kind),
  );
}
