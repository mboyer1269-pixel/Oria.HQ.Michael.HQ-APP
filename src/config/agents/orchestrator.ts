/**
 * Orchestrator agent id — single config source (rename-readiness).
 *
 * The orchestrator (Director / mission router) id is derived from the active
 * workspace config's `defaultAssistantId`, falling back to "joris". Logic that
 * needs "the orchestrator" must use ORCHESTRATOR_AGENT_ID / getOrchestratorAgentId()
 * instead of a hard-coded literal, so a future rename is a config change.
 *
 * NOTE: this does not rename anything. The value stays "joris" today, and
 * persisted ids (DB rows, ledger writers, route paths like /api/joris/...) are
 * untouched. Display names go through src/features/agents/naming.ts.
 *
 * No path aliases here: this module is loaded by node --test / jiti directly.
 */
import { MICHAEL_HQ_WORKSPACE_CONFIG } from "../workspaces/michael-hq.config.ts";

/** Historical orchestrator id; used only when the config provides none. */
const FALLBACK_ORCHESTRATOR_AGENT_ID = "joris";

export const ORCHESTRATOR_AGENT_ID: string =
  MICHAEL_HQ_WORKSPACE_CONFIG.defaultAssistantId?.trim() || FALLBACK_ORCHESTRATOR_AGENT_ID;

export function getOrchestratorAgentId(): string {
  return ORCHESTRATOR_AGENT_ID;
}
