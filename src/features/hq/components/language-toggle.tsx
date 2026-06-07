"use client";

import type { UILanguage } from "../i18n/ui-language";
import { getUICopy } from "../i18n/ui-copy";

// ---------------------------------------------------------------------------
// LanguageToggle — FR / EN pill toggle for the cockpit topbar.
// Fixed width w-[52px] (both mounted and unmounted) to prevent layout shift.
// Props-based: language state is owned by CockpitTopbar (single source of truth).
// ---------------------------------------------------------------------------

interface LanguageToggleProps {
  language: UILanguage;
  setLanguage: (next: UILanguage) => void;
  mounted: boolean;
}

export function LanguageToggle({ language, setLanguage, mounted }: LanguageToggleProps) {
  // Render same-width placeholder before mount to prevent layout shift.
  if (!mounted) {
    return <div className="w-[52px]" aria-hidden="true" />;
  }

  const next: UILanguage = language === "fr" ? "en" : "fr";
  const copy = getUICopy(language);

  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      aria-label={`Changer la langue — ${getUICopy(next).languageLabel}`}
      className="inline-flex w-[52px] items-center justify-center rounded-full border border-white/10 bg-[#141a2c]/60 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#98a1c4] transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
    >
      {copy.toggleShort}
    </button>
  );
}
