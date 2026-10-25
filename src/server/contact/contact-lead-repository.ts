import type { ContactLead, ContactLeadStatus, ContactLeadStorageMode } from "@/core/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { ContactLeadRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient, hasSupabaseAdminConfig } from "@/server/supabase/admin";

export type CreateContactLeadInput = {
  workspaceId: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  message: string;
  source?: string;
  status?: ContactLeadStatus;
};

export type ListContactLeadsInput = {
  workspaceId: string;
  limit?: number;
  status?: ContactLeadStatus;
};

export type ContactLeadRepository = {
  mode: ContactLeadStorageMode;
  create(input: CreateContactLeadInput): Promise<ContactLead>;
  listRecent(input: ListContactLeadsInput): Promise<ContactLead[]>;
};

export class ContactLeadRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: "CONTACT_LEAD_WRITE_FAILED" | "CONTACT_LEAD_WORKSPACE_UNAVAILABLE",
  ) {
    super(message);
    this.name = "ContactLeadRepositoryError";
  }
}

/**
 * Deploy-order guard (SENT-410-2). `contact_leads.workspace_id` only exists once
 * migration 0032 is applied; the operator then sets
 * ORIA_CONTACT_LEADS_WORKSPACE_SCOPED=1. Until then the Supabase repository runs
 * in legacy mode: every existing row belongs to the workspace 0032 backfills
 * (`michael-hq`), writes omit the column, that workspace reads unfiltered and any
 * other workspace is refused (writes) or sees nothing (reads). No lead is lost
 * and nothing leaks across workspaces.
 */
export const LEGACY_CONTACT_LEADS_WORKSPACE = "michael-hq";
export function isContactLeadsWorkspaceColumnReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ORIA_CONTACT_LEADS_WORKSPACE_SCOPED === "1";
}

const localContactLeads: (ContactLead & { workspaceId: string })[] = [];

function createLocalId() {
  return `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function mapContactLeadRow(row: ContactLeadRow, storageMode: ContactLeadStorageMode): ContactLead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    message: row.message,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    storageMode,
  };
}

function sortLeadsByCreatedAt(leads: ContactLead[]) {
  return [...leads].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function filterLeads(leads: ContactLead[], input: ListContactLeadsInput) {
  const limit = input.limit ?? 10;

  return sortLeadsByCreatedAt(
    leads.filter((lead) => (input.status ? lead.status === input.status : true)),
  ).slice(0, limit);
}

function createLocalContactLeadRepository(): ContactLeadRepository {
  return {
    mode: "local",
    async create(input) {
      const lead = {
        workspaceId: input.workspaceId,
        id: createLocalId(),
        name: input.name,
        email: input.email,
        phone: normalizeOptionalText(input.phone),
        company: normalizeOptionalText(input.company),
        message: input.message,
        source: input.source ?? "suivia-contact-form",
        status: input.status ?? "new",
        createdAt: new Date().toISOString(),
        storageMode: "local" as const,
      };

      localContactLeads.push({ ...lead });

      return lead;
    },
    async listRecent(input) {
      return filterLeads(localContactLeads.filter((lead) => lead.workspaceId === input.workspaceId), input).map((lead) => ({ ...lead }));
    },
  };
}

function createSupabaseContactLeadRepository(): ContactLeadRepository {
  const supabase = createOptionalSupabaseAdminClient();

  if (!supabase) {
    return createLocalContactLeadRepository();
  }

  return {
    mode: "supabase",
    async create(input) {
      const scoped = isContactLeadsWorkspaceColumnReady();
      if (!scoped && input.workspaceId !== LEGACY_CONTACT_LEADS_WORKSPACE) {
        throw new ContactLeadRepositoryError(
          "Contact leads are not workspace-scoped yet (migration 0032 pending).",
          "CONTACT_LEAD_WORKSPACE_UNAVAILABLE",
        );
      }
      const insert = supabase
        .from("contact_leads")
        .insert({
          ...(scoped ? { workspace_id: input.workspaceId } : {}),
          name: input.name,
          email: input.email,
          phone: normalizeOptionalText(input.phone),
          company: normalizeOptionalText(input.company),
          message: input.message,
          source: input.source ?? "suivia-contact-form",
          status: input.status ?? "new",
        })
        .select();
      const { data, error } = await (scoped ? insert.eq("workspace_id", input.workspaceId) : insert).single();

      if (error) {
        throw new ContactLeadRepositoryError(error.message, "CONTACT_LEAD_WRITE_FAILED");
      }

      return mapContactLeadRow(data, "supabase");
    },
    async listRecent(input) {
      const limit = input.limit ?? 10;
      const scoped = isContactLeadsWorkspaceColumnReady();
      if (!scoped && input.workspaceId !== LEGACY_CONTACT_LEADS_WORKSPACE) return [];
      let query = supabase.from("contact_leads").select();
      if (scoped) query = query.eq("workspace_id", input.workspaceId);
      query = query.order("created_at", { ascending: false }).limit(limit);

      if (input.status) {
        query = query.eq("status", input.status);
      }

      const { data, error } = await query;

      if (error) {
        throw new ContactLeadRepositoryError(error.message, "CONTACT_LEAD_WRITE_FAILED");
      }

      return (data ?? []).map((row) => mapContactLeadRow(row, "supabase"));
    },
  };
}

export function createContactLeadRepository(): ContactLeadRepository {
  if (hasSupabaseAdminConfig()) {
    return createSupabaseContactLeadRepository();
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    throw new ContactLeadRepositoryError(
      "Supabase configuration is required for contact lead persistence in production.",
      "CONTACT_LEAD_WRITE_FAILED",
    );
  }

  return createLocalContactLeadRepository();
}
