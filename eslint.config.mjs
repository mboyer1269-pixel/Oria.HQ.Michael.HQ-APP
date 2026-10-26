import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";


// ---------------------------------------------------------------------------
// Rename-readiness guard: no new hard-coded agent names / orchestrator id.
// Use ORCHESTRATOR_AGENT_ID (src/config/agents/orchestrator.ts) for logic and
// ORCHESTRATOR_DISPLAY_NAME / getAgentDisplayName() (src/features/agents/naming.ts)
// for UI copy. Comments are not checked.
//
// Documented exceptions (file → reason) live in AGENT_NAME_EXCEPTIONS below.
// ---------------------------------------------------------------------------
const AGENT_NAME_MESSAGE =
  "Hard-coded agent name/id. Use ORCHESTRATOR_AGENT_ID (logic) or ORCHESTRATOR_DISPLAY_NAME / getAgentDisplayName() (UI). See eslint.config.mjs AGENT_NAME_EXCEPTIONS.";
const AGENT_NAME_RE = "/\\bJoris\\b/";
const agentNameRule = [
  "error",
  { selector: 'Literal[value="joris"]', message: AGENT_NAME_MESSAGE },
  { selector: `Literal[value=${AGENT_NAME_RE}]`, message: AGENT_NAME_MESSAGE },
  { selector: `TemplateElement[value.raw=${AGENT_NAME_RE}]`, message: AGENT_NAME_MESSAGE },
  { selector: `JSXText[value=${AGENT_NAME_RE}]`, message: AGENT_NAME_MESSAGE },
];

/** file glob → reason. Keep this list short and justified. */
export const AGENT_NAME_EXCEPTIONS = {
  "src/config/agents/orchestrator.ts":
    "Config source: historical fallback orchestrator id.",
  "src/config/workspaces/michael-hq.config.ts":
    "Workspace config: the one place the orchestrator id/name are declared.",
  "src/features/agents/seed.ts":
    "Agent registry seed: canonical persisted id + product name (naming.ts resolves from here).",
  "src/features/agents/naming.ts":
    "Naming layer: ledger/council alias → canonical id map.",
  "src/features/agents/charter-seed.ts":
    "Charter seed data: persisted agentId + charter prose (content, not UI chrome).",
  "src/features/memory/seed.ts":
    "Seed data: persisted memory ids and historical notes/PR titles.",
  "src/features/missions/seed.ts":
    "Seed data: persisted assignedAgentId values.",
  "src/features/workflows/workflow-run-seed.ts":
    "Seed data: persisted agentId values.",
  "src/features/hq/seed.ts":
    "Seed data: product capability titles (Joris Brain / Joris Book).",
  "src/core/types.ts":
    "CalendarEventSource union: persisted DB enum value 'joris'.",
  "src/app/api/calendar/events/route.ts":
    "API schema for the persisted calendar source enum 'joris'.",
  "src/server/calendar/calendar-repository.ts":
    "Parses the persisted calendar source enum 'joris'.",
  "src/server/agents/work-order-contract.ts":
    "WorkOrderCreatedByType union: persisted category value 'joris'.",
  "src/server/joris/mission-router.ts":
    "createdByType: 'joris' is the persisted WorkOrderCreatedByType category (ids use ORCHESTRATOR_AGENT_ID); summary prose.",
  "src/server/memory/memory-vault-types.ts":
    "MemoryVaultAuthor union: persisted author value 'joris'.",
  "src/server/memory/memory-vault-repository.ts":
    "Persisted memory tag 'joris' + seeded vault entry prose.",
  "src/server/missions/mission-draft-builder.ts":
    "Persisted mission draft source value 'joris'.",
  "src/server/agents/agent-execution-license.ts":
    "License label prose ('Joris -- Director'); agentId uses ORCHESTRATOR_AGENT_ID.",
  "src/app/hq/runtime/page.tsx":
    "Runtime source filter id 'joris' matches the persisted event source; label uses the display name.",
  "src/features/cockpit/components/joris-dock.tsx":
    "Superseded, unrendered component: chat role token 'joris' + 'Joris API' internal error token.",
  "src/features/hq/components/command-center.tsx":
    "'Joris API <status>' internal error token, matched by regex in toUserError (not shown to users).",
  "src/server/joris/joris-prompt.ts":
    "LLM system prompt persona (prompt content, out of scope for this PR).",
  "src/server/joris/daily-direction-generator.ts":
    "LLM system prompt persona (prompt content).",
  "src/server/joris/joris-reply-generator.ts":
    "LLM prompt template content.",
  "src/server/joris/brain.ts":
    "Server-side brain reply prose (backend copy, follow-up PR).",
  "src/server/joris/governance-bundle-preview.ts":
    "Server-generated governance copy (follow-up PR).",
  "src/server/joris/governance-bundle-review-applicator.ts":
    "Server-generated governance copy (follow-up PR).",
  "src/server/joris/work-order-review-interpreter.ts":
    "Server-generated governance copy (follow-up PR).",
  "src/server/joris/memex-memory-evidence-summary.ts":
    "Server diagnostic prose (follow-up PR).",
  "src/server/mcp/memex-readonly-client.ts":
    "Server diagnostic prose (follow-up PR).",
  "src/server/ai/model-router.ts":
    "Model-router reason prose (follow-up PR).",
  "src/server/calendar/intent-parser.ts":
    "Persisted calendar event notes text.",
  "src/server/jobs/joris-execute-job.ts":
    "Inngest job display name (persisted job registration).",
  "src/app/api/joris/chat/route.ts":
    "Joris chat API route error/prose (route path kept as-is).",
  "src/app/api/inventory/sync/route.ts":
    "API response hint prose (follow-up PR).",
  "src/core/runtime-capability-inventory.ts":
    "Capability inventory prose (overlaps PR #406; follow-up PR).",
  "src/features/hq/capability-status.ts":
    "Capability status prose (follow-up PR).",
  "src/features/hq/i18n/ui-copy.ts":
    "i18n copy table (follow-up: interpolate display name).",
  "src/features/hq/mission-draft-format.ts":
    "Server-formatted mission draft text (follow-up PR).",
  "src/features/cockpit/events/generate-daily-direction-action.ts":
    "Server action error prose (follow-up PR).",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.*", ...Object.keys(AGENT_NAME_EXCEPTIONS)],
    rules: { "no-restricted-syntax": agentNameRule },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;