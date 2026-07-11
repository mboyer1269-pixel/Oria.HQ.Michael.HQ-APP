// Allowlist for public market-comp fetches (no credentials).
// Read-only competitive intel for Sales Desk / Joris talking points.

export const MARKET_COMP_ALLOWED_HOSTS = [
  "www.autotrader.ca",
  "autotrader.ca",
] as const;

export type MarketUrlCheck =
  | { ok: true; normalizedUrl: string }
  | { ok: false; reason: string };

/**
 * Build a Gatineau/QC AutoTrader search URL for year/make/model.
 * Example: https://www.autotrader.ca/cars/hyundai/tucson/my_2023/reg_qc/cit_gatineau
 */
export function buildAutoTraderGatineauUrl(input: {
  year: number;
  make: string;
  model: string;
}): string {
  const make = slugify(input.make);
  const model = slugify(input.model);
  const year = Math.trunc(input.year);
  return `https://www.autotrader.ca/cars/${make}/${model}/my_${year}/reg_qc/cit_gatineau`;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function checkMarketCompUrl(raw: string): MarketUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "HTTPS required" };
  }
  const host = url.hostname.toLowerCase();
  if (!MARKET_COMP_ALLOWED_HOSTS.includes(host as (typeof MARKET_COMP_ALLOWED_HOSTS)[number])) {
    return { ok: false, reason: `host not allowlisted: ${host}` };
  }
  if (!url.pathname.startsWith("/cars/")) {
    return { ok: false, reason: "path must start with /cars/" };
  }
  return { ok: true, normalizedUrl: url.toString() };
}
