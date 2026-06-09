"use client";

import { Bot, Search } from "lucide-react";
import { Tooltip } from "./ui";
import { SystemPopover } from "./system-popover";
import { LanguageToggle } from "../../hq/components/language-toggle";
import { useUILanguage } from "../../hq/i18n/ui-language";
import { getUICopy } from "../../hq/i18n/ui-copy";

// ---------------------------------------------------------------------------
// CockpitTopbar — client component extracted from CockpitShell.
// Owns the single useUILanguage() instance; passes state down to LanguageToggle
// so badge and toggle stay in sync on every click.
// CockpitShell remains a server component; only this topbar is client-side.
// ---------------------------------------------------------------------------

interface CockpitTopbarProps {
  crumb: string;
  userInitial: string;
}

export function CockpitTopbar({ crumb, userInitial }: CockpitTopbarProps) {
  const { language, setLanguage, mounted } = useUILanguage();
  // Before mount: use default FR copy (stable, matches SSR).
  const copy = getUICopy(mounted ? language : "fr");

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3.5 border-b border-white/[0.06] bg-[#080b16]/75 px-5 py-3 backdrop-blur-xl">
      <div className="text-[13px] text-[#646c8e]">
        Oria HQ&nbsp;/&nbsp;<span className="text-[#eff1fb]">{crumb}</span>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("cockpit:open-palette"))}
        aria-label="Ouvrir la palette de navigation"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#141a2c]/60 px-3 text-xs font-semibold text-[#98a1c4] transition hover:border-white/20 hover:text-[#eff1fb]"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden md:inline">Rechercher</span>
        <kbd className="hidden rounded border border-white/10 bg-[#0b0f1d] px-1.5 py-0.5 font-mono text-[10px] text-[#646c8e] md:inline">
          ⌘K
        </kbd>
      </button>
      <SystemPopover />
      <Tooltip
        title="Joris"
        detail={copy.jorisTooltip}
        align="right"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#141a2c]/60 px-3 py-1.5 text-xs font-semibold text-[#98a1c4]">
          <Bot className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
          {copy.jorisBadge}
        </span>
      </Tooltip>
      <LanguageToggle language={language} setLanguage={setLanguage} mounted={mounted} />
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-[#1e2440] to-[#2c376a] text-sm font-bold text-[#eff1fb]">
        {userInitial}
      </span>
    </header>
  );
}
