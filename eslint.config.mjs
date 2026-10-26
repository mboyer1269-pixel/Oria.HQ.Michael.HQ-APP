import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";


// ---------------------------------------------------------------------------
// Rename-readiness guard: no new hard-coded agent names / orchestrator id.
// Use ORCHESTRATOR_AGENT_ID (src/config/agents/orchestrator.ts) for logic and
// ORCHESTRATOR_DISPLAY_NAME / getAgentDisplayName() (src/features/agents/naming.ts)
// for UI copy. Comments are not checked.
//
// No whole-file exceptions. Where a literal is legitimately required (persisted
// enum/id value, config source, seed data, LLM prompt persona, internal error
// token), suppress that single line with:
//   // eslint-disable-next-line no-restricted-syntax -- <justification>
// Known gaps (documented, not checked): "JORIS", "joris_orchestrator",
// "/api/joris/..." paths, and names built by string concatenation.
// ---------------------------------------------------------------------------
const AGENT_NAME_MESSAGE =
  "Hard-coded agent name/id. Use ORCHESTRATOR_AGENT_ID (logic) or ORCHESTRATOR_DISPLAY_NAME / getAgentDisplayName() (UI). Per-line `eslint-disable-next-line no-restricted-syntax -- <reason>` only if the literal is a persisted value/config/prompt.";
const AGENT_NAME_RE = "/\\bJoris\\b/";
const agentNameRule = [
  "error",
  { selector: 'Literal[value="joris"]', message: AGENT_NAME_MESSAGE },
  { selector: `Literal[value=${AGENT_NAME_RE}]`, message: AGENT_NAME_MESSAGE },
  { selector: `TemplateElement[value.raw=${AGENT_NAME_RE}]`, message: AGENT_NAME_MESSAGE },
  { selector: `JSXText[value=${AGENT_NAME_RE}]`, message: AGENT_NAME_MESSAGE },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.*"],
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