// Memory Vault — canonical server-side types.
//
// These types are workspace-bound and live server-side only.
// They are NOT the same as the view-model types in src/features/memory/types.ts,
// which back a separate UI layer.
//
// See docs/MEMORY_VAULT_CONTRACT.md for the full contract.

export type MemoryVaultEntryType = "decision" | "sop" | "note" | "source" | "doc";
export type MemoryVaultAuthor = "human" | "joris" | "agent";
export type MemoryVaultTrustLevel = "verified" | "proposed" | "draft";

export type MemoryVaultEntry = {
  id: string;
  workspaceId: string;
  type: MemoryVaultEntryType;
  title: string;
  content: string;
  tags: string[];
  author: MemoryVaultAuthor;
  trustLevel: MemoryVaultTrustLevel;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  sourceRef?: string;
  expiresAt?: string;
};

export type MemoryVaultReadQuery = {
  workspaceId: string;
  types?: MemoryVaultEntryType[];
  tags?: string[];
  /** default: "verified" — only verified entries are injected into Joris context */
  trustLevel?: MemoryVaultTrustLevel;
  /** default: 20 */
  limit?: number;
};

export type MemoryVaultReadResult = {
  entries: MemoryVaultEntry[];
  workspaceId: string;
  retrievedAt: string;
  truncated: boolean;
};

export type MemoryVaultProposeInput = {
  workspaceId: string;
  type: MemoryVaultEntryType;
  title: string;
  content: string;
  tags?: string[];
  author: MemoryVaultAuthor;
  sourceRef?: string;
  expiresAt?: string;
};
