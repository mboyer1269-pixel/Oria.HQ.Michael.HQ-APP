/** DRAFT / NOT LIVE: opening requires authenticated persistence and RLS qualification. */
export const AGENT_DISPLAY_NAMES_LIVE = false;
export function isAgentDisplayNameStorageEnabled(): boolean {
  return AGENT_DISPLAY_NAMES_LIVE;
}
