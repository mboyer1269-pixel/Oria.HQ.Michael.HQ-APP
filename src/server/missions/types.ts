import type { Mission } from "@/core/types";

export type ListMissionsInput = {
  workspaceId: string;
  /** When provided, filter missions to this mode. When omitted, return all modes. */
  modeId?: string;
};

export type ListMissionsResult = {
  workspaceId: string;
  modeId?: string;
  missions: Mission[];
  source: "mock" | "supabase";
};
