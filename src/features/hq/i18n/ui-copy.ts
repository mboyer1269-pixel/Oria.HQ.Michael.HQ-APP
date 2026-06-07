import type { UILanguage } from "./ui-language";

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

const COPY: Record<UILanguage, TopbarCopy> = {
  fr: {
    jorisBadge: "Joris · actif",
    jorisTooltip:
      "Joris alimente le plan du jour et les signaux du cockpit. Les actions live restent gouvernées.",
    languageLabel: "Français",
    toggleShort: "FR",
  },
  en: {
    jorisBadge: "Joris · active",
    jorisTooltip:
      "Joris powers the daily direction and cockpit signals. Live actions remain governed.",
    languageLabel: "English",
    toggleShort: "EN",
  },
};

export function getUICopy(language: UILanguage): TopbarCopy {
  return COPY[language];
}
