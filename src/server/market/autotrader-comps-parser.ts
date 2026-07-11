// Parse AutoTrader.ca search HTML (__NEXT_DATA__) into market comps.
// Public read-only — no API keys.

export type MarketCompListing = {
  source: "autotrader";
  title: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  priceCad?: number;
  mileageKm?: number;
  priceBadge?: "great" | "good" | "fair" | "high" | "unknown";
  dealerName?: string;
  city?: string;
  listingUrl?: string;
  photoUrl?: string;
};

export type ParsedMarketCompsPage = {
  listings: MarketCompListing[];
  parseWarnings: string[];
  resultCount?: number;
  sourceUrl: string;
};

function badgeFromEvaluation(raw: unknown, trackingLabel?: string): MarketCompListing["priceBadge"] {
  const label = (trackingLabel ?? "").toLowerCase();
  if (label.includes("top-price") || label.includes("great")) return "great";
  if (label.includes("good")) return "good";
  if (typeof raw === "number") {
    // AutoTrader priceEvaluation: lower is better in observed payloads (1 ≈ Great)
    if (raw <= 1) return "great";
    if (raw === 2) return "good";
    if (raw === 3) return "fair";
    if (raw >= 4) return "high";
  }
  return "unknown";
}

function parseMileageKm(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw !== "string") return undefined;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function parseOneListing(raw: unknown): MarketCompListing | null {
  const row = asRecord(raw);
  if (!row) return null;
  const vehicle = asRecord(row.vehicle);
  const price = asRecord(row.price);
  const location = asRecord(row.location);
  const seller = asRecord(row.seller);
  const tracking = asRecord(row.tracking);

  const year =
    typeof vehicle?.modelYear === "number"
      ? vehicle.modelYear
      : Number.parseInt(String(vehicle?.modelYear ?? ""), 10);
  const make = typeof vehicle?.make === "string" ? vehicle.make : undefined;
  const model =
    (typeof vehicle?.modelGroup === "string" && vehicle.modelGroup) ||
    (typeof vehicle?.model === "string" ? String(vehicle.model) : undefined);
  if (!make || !model || !Number.isFinite(year)) return null;

  const trim =
    (typeof vehicle?.modelVersionInput === "string" && vehicle.modelVersionInput) ||
    (typeof vehicle?.modelVersionCustom === "string" ? vehicle.modelVersionCustom : undefined);

  const priceCad =
    typeof price?.priceRaw === "number"
      ? price.priceRaw
      : typeof tracking?.price === "string"
        ? Number.parseInt(tracking.price, 10)
        : undefined;

  const mileageKm =
    parseMileageKm(vehicle?.mileageInKm) ??
    parseMileageKm(tracking?.mileage);

  const images = Array.isArray(row.images) ? row.images.filter((u) => typeof u === "string") : [];
  const photoUrl = typeof images[0] === "string" ? images[0] : undefined;

  return {
    source: "autotrader",
    title: `${year} ${make} ${model}${trim ? ` ${trim}` : ""}`,
    year,
    make,
    model,
    trim: trim || undefined,
    priceCad: Number.isFinite(priceCad) ? priceCad : undefined,
    mileageKm,
    priceBadge: badgeFromEvaluation(price?.priceEvaluation, String(tracking?.priceLabel ?? "")),
    dealerName: typeof seller?.companyName === "string" ? seller.companyName : undefined,
    city: typeof location?.city === "string" ? location.city : undefined,
    listingUrl: typeof row.url === "string" ? row.url : undefined,
    photoUrl,
  };
}

/**
 * Extract listings from AutoTrader search HTML via __NEXT_DATA__.
 */
export function parseAutoTraderCompsHtml(html: string, sourceUrl: string): ParsedMarketCompsPage {
  const warnings: string[] = [];
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) {
    warnings.push("no __NEXT_DATA__ — page may be blocked or layout changed");
    return { listings: [], parseWarnings: warnings, sourceUrl };
  }

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    warnings.push("failed to parse __NEXT_DATA__ JSON");
    return { listings: [], parseWarnings: warnings, sourceUrl };
  }

  const pageProps = asRecord(asRecord(asRecord(data)?.props)?.pageProps);
  const rawListings = pageProps?.listings;
  const resultCount =
    typeof pageProps?.numberOfResults === "number" ? pageProps.numberOfResults : undefined;

  if (!Array.isArray(rawListings)) {
    warnings.push("pageProps.listings missing");
    return { listings: [], parseWarnings: warnings, resultCount, sourceUrl };
  }

  const listings: MarketCompListing[] = [];
  for (const raw of rawListings) {
    const parsed = parseOneListing(raw);
    if (parsed) listings.push(parsed);
    else warnings.push("skipped unparsable AutoTrader listing");
  }

  return { listings, parseWarnings: warnings, resultCount, sourceUrl };
}
