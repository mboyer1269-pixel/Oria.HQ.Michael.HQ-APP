// src/server/inventory/vdp-photo-enrich.ts
//
// Optional VDP HTML fetch to collect more d2cmedia gallery photos.
// Fail-soft: returns existing photos on any network/parse failure.

import { checkPublicInventoryUrl } from "./public-inventory-allowlist";

const D2C_IMG_RE =
  /https:\/\/(?:imagescdn|carimages)\.d2cmedia\.ca\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi;

export async function enrichPhotoUrlsFromVdp(input: {
  listingUrl?: string;
  existingPhotoUrls: string[];
  fetchImpl?: typeof fetch;
  userAgent?: string;
}): Promise<{ photoUrls: string[]; enriched: boolean; warning?: string }> {
  const existing = [...new Set(input.existingPhotoUrls.filter(Boolean))];
  if (!input.listingUrl) {
    return { photoUrls: existing, enriched: false, warning: "no listingUrl" };
  }
  const check = checkPublicInventoryUrl(input.listingUrl);
  if (!check.ok || !check.normalizedUrl) {
    return { photoUrls: existing, enriched: false, warning: check.reason };
  }

  try {
    const fetchImpl = input.fetchImpl ?? fetch;
    const res = await fetchImpl(check.normalizedUrl, {
      headers: {
        "user-agent": input.userAgent ?? "OriaHQ-InventorySync/1.0",
        accept: "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return { photoUrls: existing, enriched: false, warning: `VDP HTTP ${res.status}` };
    }
    const html = await res.text();
    const found = [...html.matchAll(D2C_IMG_RE)].map((m) => m[0]);
    const gallery = found.filter((u) => /\/\d+\/\d+\//.test(u));
    const merged = [...new Set([...existing, ...(gallery.length ? gallery : found)])];
    return {
      photoUrls: merged.slice(0, 20), // Marketplace soft cap ~20
      enriched: merged.length > existing.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { photoUrls: existing, enriched: false, warning: message };
  }
}
