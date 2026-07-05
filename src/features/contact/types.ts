// Contact domain types are canonical in `src/core/types.ts`.
// Re-exported here so existing feature/app imports continue to resolve, while
// the server layer imports them directly from `@/core/types`.
export type {
  ContactLeadStatus,
  ContactLeadStorageMode,
  ContactNotificationStatus,
  ContactLead,
} from "@/core/types";
