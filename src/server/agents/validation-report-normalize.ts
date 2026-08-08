// Pure market-report normalizer — no I/O, no server-only (testable).

export type NormalizedMarketReport = {
  reportId: string;
  title: string;
  projectBrief: string;
  marketSizing: {
    tamUsd: number;
    samUsd: number;
    somUsd: number;
    currency: "USD";
    rationale: string;
  };
  acquisitionChannels: {
    channel: string;
    fit: "high" | "medium" | "low";
    notes: string;
  }[];
  demandVerdict: "proceed" | "iterate" | "kill";
  evidenceSummary: string;
};

function isFit(value: unknown): value is "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low";
}

function isVerdict(value: unknown): value is "proceed" | "iterate" | "kill" {
  return value === "proceed" || value === "iterate" || value === "kill";
}

export function normalizeMarketReport(
  json: unknown,
  fallbackBrief: string,
  reportIdFactory: () => string = () =>
    `val_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
): NormalizedMarketReport | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const raw = json as Record<string, unknown>;
  const sizing = raw.marketSizing;
  if (!sizing || typeof sizing !== "object" || Array.isArray(sizing)) return null;
  const s = sizing as Record<string, unknown>;

  const tamUsd = Number(s.tamUsd);
  const samUsd = Number(s.samUsd);
  const somUsd = Number(s.somUsd);
  if (![tamUsd, samUsd, somUsd].every((n) => Number.isFinite(n) && n >= 0)) return null;
  if (!(somUsd <= samUsd && samUsd <= tamUsd)) return null;
  if (typeof s.rationale !== "string" || s.rationale.trim().length === 0) return null;
  if (!isVerdict(raw.demandVerdict)) return null;
  if (typeof raw.evidenceSummary !== "string" || raw.evidenceSummary.trim().length === 0) {
    return null;
  }

  const channelsRaw = Array.isArray(raw.acquisitionChannels) ? raw.acquisitionChannels : [];
  const acquisitionChannels = channelsRaw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      channel: typeof c.channel === "string" ? c.channel : "",
      fit: isFit(c.fit) ? c.fit : ("medium" as const),
      notes: typeof c.notes === "string" ? c.notes : "",
    }))
    .filter((c) => c.channel.length > 0);

  if (acquisitionChannels.length < 2) return null;

  return {
    reportId: reportIdFactory(),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Demand check",
    projectBrief:
      typeof raw.projectBrief === "string" && raw.projectBrief.trim()
        ? raw.projectBrief.trim()
        : fallbackBrief.slice(0, 800),
    marketSizing: {
      tamUsd,
      samUsd,
      somUsd,
      currency: "USD",
      rationale: s.rationale.trim(),
    },
    acquisitionChannels,
    demandVerdict: raw.demandVerdict,
    evidenceSummary: raw.evidenceSummary.trim(),
  };
}
