export const MAX_AGENT_DISPLAY_NAME_LENGTH = 80;

export function normalizeAgentDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && Array.from(name).length <= MAX_AGENT_DISPLAY_NAME_LENGTH && !/[\u0000-\u001f\u007f]/u.test(name) ? name : null;
}

export type AgentDisplayNameWriteResult =
  | { status: "saved"; displayName: string | null }
  | { status: "unavailable" | "invalid" | "forbidden"; message: string };
