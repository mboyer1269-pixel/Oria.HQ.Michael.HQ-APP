import type { UILanguage } from "./ui-language";
import { ORCHESTRATOR_DISPLAY_NAME } from "../../agents/orchestrator-display";

// ---------------------------------------------------------------------------
// Topbar UI copy — FR / EN. Scope: cockpit topbar only.
// No "use client" needed — this is a pure data module.
// ---------------------------------------------------------------------------

interface TopbarCopy {
  jorisBadge: string;
  jorisTooltip: string;
  languageLabel: string;
  toggleShort: string;
}

const COPY: Record<UILanguage, (name: string) => TopbarCopy> = {
  fr: (name) => ({
    jorisBadge: `${name} · assistant`,
    jorisTooltip:
      `${name} alimente le plan du jour et les signaux du cockpit. Les actions live restent gouvernées.`,
    languageLabel: "Français",
    toggleShort: "FR",
  }),
  en: (name) => ({
    jorisBadge: `${name} · assistant`,
    jorisTooltip:
      `${name} powers the daily direction and cockpit signals. Live actions remain governed.`,
    languageLabel: "English",
    toggleShort: "EN",
  }),
};

/**
 * `assistantName` is interpolated into the badge/tooltip so the topbar never
 * hard-codes the agent name; callers can pass a per-user display name.
 */
export function getUICopy(language: UILanguage, assistantName: string = ORCHESTRATOR_DISPLAY_NAME): TopbarCopy {
  return COPY[language](assistantName);
}
