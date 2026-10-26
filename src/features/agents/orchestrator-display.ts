import { ORCHESTRATOR_AGENT_ID } from "../../config/agents/orchestrator.ts";
import { getAgentDisplayName } from "./naming";

/**
 * Product display name of the orchestrator agent, resolved through the naming
 * layer (naming.ts → agent registry). UI copy must use this instead of a
 * hard-coded agent name. Today it resolves to "Joris" — behaviour unchanged.
 */
export const ORCHESTRATOR_DISPLAY_NAME: string = getAgentDisplayName(ORCHESTRATOR_AGENT_ID);
