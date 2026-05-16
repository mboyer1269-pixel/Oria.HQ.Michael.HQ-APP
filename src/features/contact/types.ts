export type ContactLeadStatus = "new" | "contacted" | "qualified" | "closed" | "spam";

export type ContactLeadStorageMode = "local" | "supabase";

export type ContactNotificationStatus = "skipped" | "queued" | "failed";

export type ContactLead = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  source: string;
  status: ContactLeadStatus;
  createdAt: string;
  storageMode: ContactLeadStorageMode;
};
