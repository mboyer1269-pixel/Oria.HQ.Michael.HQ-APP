import { normalizeDisplayText } from "@/core/text/display-text-rule";

export const MAX_AGENT_DISPLAY_NAME_LENGTH = 80;

/** Shared display-text rule (NFC, no Cc/Cf/U+2028/U+2029); mirrored by 0036's CHECK. */
export function normalizeAgentDisplayName(value: unknown): string | null {
  return normalizeDisplayText(value, { maxLength: MAX_AGENT_DISPLAY_NAME_LENGTH });
}

export type AgentDisplayNameWriteResult =
  | { status: "saved"; displayName: string | null }
  | { status: "unavailable" | "invalid" | "forbidden"; message: string };
