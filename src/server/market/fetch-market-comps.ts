// Fetch allowlisted AutoTrader public search → market comps → advantage brief.

import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import {
  buildAutoTraderGatineauUrl,
  checkMarketCompUrl,
} from "./market-comps-allowlist";
import { parseAutoTraderCompsHtml, type MarketCompListing } from "./autotrader-comps-parser";
import {
  buildMarketAdvantageBrief,
  type MarketAdvantageBrief,
  type MarketTarget,
} from "./market-advantage-brief";

export type FetchMarketBriefInput = {
  target: MarketTarget;
  inventory?: VehicleStock[];
  focusVehicle?: VehicleStock | null;
  fetchImpl?: typeof fetch;
  userAgent?: string;
};

export type FetchMarketBriefResult =
  | { ok: true; brief: MarketAdvantageBrief; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const DEFAULT_UA = "OriaHQ-MarketScan/1.0 (+https://oria.local; public-read-only)";
const FETCH_TIMEOUT_MS = 20_000;

async function fetchHtml(
  url: string,
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} for ${url}` };
    const html = await res.text();
    if (!html || html.length < 200) return { ok: false, error: `empty/short body for ${url}` };
    return { ok: true, html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `fetch failed for ${url}: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Public AutoTrader Gatineau comps + on-lot advantage brief.
 */
export async function fetchMarketAdvantageBrief(
  input: FetchMarketBriefInput,
): Promise<FetchMarketBriefResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const fetchImpl = input.fetchImpl ?? fetch;
  const userAgent = input.userAgent ?? DEFAULT_UA;

  const url = buildAutoTraderGatineauUrl(input.target);
  const check = checkMarketCompUrl(url);
  if (!check.ok) {
    return { ok: false, errors: [`URL rejected: ${check.reason}`], warnings };
  }

  const fetched = await fetchHtml(check.normalizedUrl, fetchImpl, userAgent);
  if (!fetched.ok) {
    return { ok: false, errors: [fetched.error], warnings };
  }

  const parsed = parseAutoTraderCompsHtml(fetched.html, check.normalizedUrl);
  warnings.push(...parsed.parseWarnings);

  const comps: MarketCompListing[] = parsed.listings;
  if (comps.length === 0) {
    errors.push("no market comps parsed from AutoTrader");
  }

  const brief = buildMarketAdvantageBrief({
    target: input.target,
    comps,
    sourceUrl: check.normalizedUrl,
    inventory: input.inventory ?? [],
    focusVehicle: input.focusVehicle,
  });

  if (errors.length && comps.length === 0) {
    return { ok: false, errors, warnings };
  }

  return { ok: true, brief, warnings };
}
