// src/server/agents/booster-contract.ts

/**
 * Pure TypeScript contracts for Booster entities used within the Orya HQ Agentic
 * Holding OS. A Booster is a capability upgrade that can be attached to an
 * AgentProfile to extend its skill set, increase autonomy, or provide additional
 * resources. These contracts are side‑effect‑free and contain no runtime logic.
 */

export enum BoosterType {
  MODEL = "model",
  DATASET = "dataset",
  TOOL = "tool",
  INFRA = "infra",
}

export enum BoosterStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  EXPIRED = "expired",
}

/** Simple representation of a Booster record */
export interface Booster {
  /** Unique identifier */
  id: string;
  /** Human‑readable name */
  name: string;
  /** Type of the booster */
  type: BoosterType;
  /** Current status */
  status: BoosterStatus;
  /** Optional description */
  description?: string;
  /** Optional metadata such as version, provider, etc. */
  meta?: Record<string, unknown>;
}


