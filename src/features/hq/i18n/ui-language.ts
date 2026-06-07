"use client";
import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// UI language hook — FR/EN toggle, localStorage-backed, hydration-safe.
// Default is always "fr" on first render (matches SSR); localStorage is read
// inside useEffect to avoid hydration mismatch.
// ---------------------------------------------------------------------------

export type UILanguage = "fr" | "en";

const DEFAULT_UI_LANGUAGE: UILanguage = "fr";
const STORAGE_KEY = "oria-ui-language";

function isUILanguage(value: string | null): value is UILanguage {
  return value === "fr" || value === "en";
}

interface UIState {
  language: UILanguage;
  mounted: boolean;
}

export function useUILanguage() {
  const [state, setState] = useState<UIState>({
    language: DEFAULT_UI_LANGUAGE,
    mounted: false,
  });

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // Hydration-safety: localStorage is an external system; reading it on mount
    // and calling setState once is the correct pattern to avoid SSR/client mismatch.
    // No cascading render risk — empty deps array, runs exactly once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({
      language: isUILanguage(stored) ? stored : DEFAULT_UI_LANGUAGE,
      mounted: true,
    });
  }, []);

  function setLanguage(next: UILanguage) {
    setState((prev) => ({ ...prev, language: next }));
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return { language: state.language, setLanguage, mounted: state.mounted };
}
