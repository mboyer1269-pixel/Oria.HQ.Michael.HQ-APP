// src/server/sales/lead-bank-store.ts
//
// In-memory SalesLead bank. Dedupe on phone/email. Not durable.

import {
  normalizeEmail,
  normalizePhone,
  validateSalesLead,
  type SalesLead,
} from "@/features/sales/sales-lead";

type LeadBankGlobals = typeof globalThis & {
  __oriaLeadBankStore?: Map<string, Map<string, SalesLead>>;
};

function getRoot(): Map<string, Map<string, SalesLead>> {
  const globals = globalThis as LeadBankGlobals;
  if (!globals.__oriaLeadBankStore) {
    globals.__oriaLeadBankStore = new Map();
  }
  return globals.__oriaLeadBankStore;
}

function workspaceMap(workspaceId: string): Map<string, SalesLead> {
  const root = getRoot();
  let map = root.get(workspaceId);
  if (!map) {
    map = new Map();
    root.set(workspaceId, map);
  }
  return map;
}

export function listSalesLeads(workspaceId: string): SalesLead[] {
  return [...workspaceMap(workspaceId).values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getSalesLead(workspaceId: string, leadId: string): SalesLead | null {
  return workspaceMap(workspaceId).get(leadId) ?? null;
}

function findDedupeMatch(
  map: Map<string, SalesLead>,
  phone?: string,
  email?: string,
  excludeLeadId?: string,
): SalesLead | null {
  const nPhone = normalizePhone(phone);
  const nEmail = normalizeEmail(email);
  for (const lead of map.values()) {
    if (excludeLeadId && lead.leadId === excludeLeadId) continue;
    if (nPhone && normalizePhone(lead.phone) === nPhone) return lead;
    if (nEmail && normalizeEmail(lead.email) === nEmail) return lead;
  }
  return null;
}

export type UpsertLeadInput = {
  workspaceId: string;
  lead: Omit<SalesLead, "createdAt" | "updatedAt" | "nextFollowUpAt"> & {
    createdAt?: string;
    updatedAt?: string;
    /** `null` clears the follow-up date; `undefined` keeps prior on merge. */
    nextFollowUpAt?: string | null;
  };
  nowIso?: string;
  /** When true, merge into existing phone/email match instead of failing. */
  mergeOnDedupe?: boolean;
};

export type UpsertLeadResult =
  | { ok: true; lead: SalesLead; created: boolean; mergedFromLeadId?: string }
  | { ok: false; errors: string[] };

export function upsertSalesLead(input: UpsertLeadInput): UpsertLeadResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const map = workspaceMap(input.workspaceId);
  const incoming = input.lead;
  const existingById = map.get(incoming.leadId);
  const dedupe = findDedupeMatch(
    map,
    incoming.phone,
    incoming.email,
    existingById ? incoming.leadId : undefined,
  );

  let targetId = incoming.leadId;
  let created = !existingById;
  let mergedFromLeadId: string | undefined;

  if (dedupe && dedupe.leadId !== incoming.leadId) {
    if (!input.mergeOnDedupe) {
      return {
        ok: false,
        errors: [`duplicate contact matches existing lead ${dedupe.leadId}`],
      };
    }
    targetId = dedupe.leadId;
    created = false;
    mergedFromLeadId = incoming.leadId !== dedupe.leadId ? incoming.leadId : undefined;
  }

  const prior = map.get(targetId);
  const resolvedStage =
    prior &&
    incoming.stage === "new" &&
    prior.stage !== "sold" &&
    prior.stage !== "lost" &&
    prior.stage !== "new"
      ? prior.stage
      : incoming.stage;

  const lead: SalesLead = {
    leadId: targetId,
    fullName: incoming.fullName.trim(),
    phone: normalizePhone(incoming.phone) ?? prior?.phone,
    email: normalizeEmail(incoming.email) ?? prior?.email,
    source: incoming.source,
    sourceRef: incoming.sourceRef ?? prior?.sourceRef,
    interestedStockIds: uniqueStrings([
      ...(prior?.interestedStockIds ?? []),
      ...(incoming.interestedStockIds ?? []),
    ]),
    interestedModels: uniqueStrings([
      ...(prior?.interestedModels ?? []),
      ...(incoming.interestedModels ?? []),
    ]),
    stage: resolvedStage,
    consentBasis: incoming.consentBasis,
    consentNote: incoming.consentNote ?? prior?.consentNote,
    nextFollowUpAt:
      incoming.nextFollowUpAt === null
        ? undefined
        : (incoming.nextFollowUpAt ?? prior?.nextFollowUpAt),
    lastContactAt: incoming.lastContactAt ?? prior?.lastContactAt,
    lostReason: resolvedStage === "lost" ? incoming.lostReason : undefined,
    soldStockId: resolvedStage === "sold" ? incoming.soldStockId : undefined,
    soldAt: resolvedStage === "sold" ? (incoming.soldAt ?? prior?.soldAt) : undefined,
    notes: mergeNotes(prior?.notes, incoming.notes),
    createdAt: prior?.createdAt ?? incoming.createdAt ?? nowIso,
    updatedAt: nowIso,
    createdByUserId: prior?.createdByUserId ?? incoming.createdByUserId,
  };

  const validation = validateSalesLead(lead);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  map.set(lead.leadId, lead);
  return { ok: true, lead, created, mergedFromLeadId };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function mergeNotes(prior: string | undefined, next: string | undefined): string {
  const a = (prior ?? "").trim();
  const b = (next ?? "").trim();
  if (!a) return b;
  if (!b || a === b) return a;
  if (a.includes(b)) return a;
  return `${a}\n---\n${b}`;
}

export function clearLeadBankStore(): void {
  getRoot().clear();
}
