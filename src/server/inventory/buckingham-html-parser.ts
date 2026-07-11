// src/server/inventory/buckingham-html-parser.ts
//
// Parse Buckingham GM (d2cmedia) inventory search HTML into VehicleStock[].
// Relies on carBoxWrapper + JSON-LD Vehicle + data-* attributes.
// Pure string parsing — no DOM dependency.

import type { VehicleCondition, VehicleStock } from "@/features/inventory/vehicle-stock";
import { normalizeVehicleStock, validateVehicleStock } from "@/features/inventory/vehicle-stock";

export type ParsedInventoryPage = {
  vehicles: VehicleStock[];
  parseWarnings: string[];
  cardCount: number;
};

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&agrave;/gi, "à")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function extractAttr(chunk: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}="([^"]*)"`, "i");
  const m = chunk.match(re);
  return m?.[1] ? decodeBasicEntities(m[1]) : undefined;
}

function extractJsonLdVehicles(chunk: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(chunk)) !== null) {
    try {
      const json = JSON.parse(match[1]!) as Record<string, unknown>;
      const type = String(json["@type"] ?? "");
      if (type === "Vehicle" || type === "Product") out.push(json);
    } catch {
      // ignore malformed ld+json
    }
  }
  return out;
}

function conditionFromOffer(itemCondition: unknown, stockNumber?: string): VehicleCondition {
  const raw = String(itemCondition ?? "").toLowerCase();
  if (raw.includes("new")) return "new";
  if (raw.includes("used") || raw.includes("certif")) {
    return stockNumber?.toUpperCase().includes("CPO") ? "cpo" : "used";
  }
  if (stockNumber?.toUpperCase().includes("NEUF")) return "new";
  if (stockNumber?.toUpperCase().includes("DEMO")) return "used";
  return "used";
}

function absoluteListingUrl(href: string | undefined, baseOrigin: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, baseOrigin).toString();
  } catch {
    return undefined;
  }
}

function parseOneCard(chunk: string, baseOrigin: string): VehicleStock | null {
  const carImage = chunk.match(/<div[^>]*class="[^"]*carImage[^"]*"[^>]*>/i)?.[0] ?? chunk;
  const stockNumber =
    extractAttr(carImage, "data-nostock") ??
    extractAttr(chunk, "data-nostock") ??
    chunk.match(/#\s*de\s*stock:\s*([A-Z0-9-]+)/i)?.[1];
  const vin =
    extractAttr(carImage, "data-vin") ??
    extractAttr(chunk, "data-vin") ??
    chunk.match(/vehicleIdentificationNumber"\s*:\s*"([A-HJ-NPR-Z0-9]{17})"/i)?.[1];
  const make = extractAttr(carImage, "data-make") ?? extractAttr(chunk, "data-make");
  const model = extractAttr(carImage, "data-model") ?? extractAttr(chunk, "data-model");
  const yearRaw = extractAttr(carImage, "data-year") ?? extractAttr(chunk, "data-year");
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : NaN;

  const ldVehicles = extractJsonLdVehicles(chunk);
  const vehicleLd = ldVehicles.find((j) => j["@type"] === "Vehicle") ?? ldVehicles[0];
  const offer =
    vehicleLd && typeof vehicleLd.offers === "object" && vehicleLd.offers
      ? (vehicleLd.offers as Record<string, unknown>)
      : undefined;

  const priceCad =
    typeof offer?.price === "number"
      ? offer.price
      : typeof offer?.price === "string"
        ? Number.parseFloat(offer.price)
        : undefined;

  const images: string[] = [];
  if (Array.isArray(vehicleLd?.image)) {
    for (const img of vehicleLd.image) {
      if (typeof img === "string" && img.startsWith("http")) images.push(img);
    }
  } else if (typeof vehicleLd?.image === "string" && vehicleLd.image.startsWith("http")) {
    images.push(vehicleLd.image);
  }
  const dataImg = chunk.match(/data-imgsrc="(https:\/\/[^"]+)"/i)?.[1];
  if (dataImg) images.push(dataImg);

  const href =
    (typeof offer?.url === "string" ? offer.url : undefined) ??
    chunk.match(/href="(\/neufs\/inventaire\/[^"]+|\/occasion\/[^"]+)"/i)?.[1];
  const listingUrl = absoluteListingUrl(href, baseOrigin);

  const carId = extractAttr(chunk, "data-carid") ?? chunk.match(/id="V(\d+)"/i)?.[1];
  const stockId = stockNumber?.trim() || (carId ? `car_${carId}` : undefined);
  if (!stockId || !make || !model || !Number.isFinite(year)) return null;

  // Trim heuristic from title / name
  const name = typeof vehicleLd?.name === "string" ? vehicleLd.name : `${make} ${model}`;
  const trimMatch = name.match(/\b(LT|RS|Premier|AT4|Denali|Elevation|Preferred|Sport|Activ)\b/i);

  const vehicle: VehicleStock = normalizeVehicleStock({
    stockId,
    stockNumber: stockNumber?.trim(),
    vin: vin?.trim().toUpperCase(),
    year,
    make,
    model,
    trim: trimMatch?.[1],
    condition: conditionFromOffer(offer?.itemCondition, stockNumber),
    priceCad: Number.isFinite(priceCad) ? priceCad : undefined,
    photoUrls: [...new Set(images)],
    listingUrl,
    notes: carId ? `d2cmedia carId=${carId}` : undefined,
  });

  const validation = validateVehicleStock(vehicle);
  return validation.valid ? vehicle : null;
}

/**
 * Parse a Buckingham / d2cmedia inventory search HTML page.
 */
export function parseBuckinghamInventoryHtml(
  html: string,
  pageUrl: string,
): ParsedInventoryPage {
  const warnings: string[] = [];
  let baseOrigin = "https://www.buckinghamgm.com";
  try {
    baseOrigin = new URL(pageUrl).origin;
  } catch {
    warnings.push("invalid pageUrl — using default origin");
  }

  const cardRe = /<li\b[^>]*class="[^"]*carBoxWrapper[^"]*"[^>]*>[\s\S]*?<\/li>/gi;
  const cards = html.match(cardRe) ?? [];
  if (cards.length === 0) {
    warnings.push("no carBoxWrapper cards found — page may be JS-empty or layout changed");
  }

  const byStock = new Map<string, VehicleStock>();
  for (const card of cards) {
    const vehicle = parseOneCard(card, baseOrigin);
    if (!vehicle) {
      warnings.push("skipped unparsable carBoxWrapper card");
      continue;
    }
    byStock.set(vehicle.stockId, vehicle);
  }

  return {
    vehicles: [...byStock.values()],
    parseWarnings: warnings,
    cardCount: cards.length,
  };
}
