// src/server/marketplace-listings/photo-url-allowlist.ts
//
// HTTPS photo hosts allowed when bundling a Marketplace photo pack ZIP.
// Public dealer CDN only — no credentials, no arbitrary SSRF.

export const MARKETPLACE_PHOTO_ALLOWED_HOSTS = new Set([
  "imagescdn.d2cmedia.ca",
  "carimages.d2cmedia.ca",
  "www.buckinghamgm.com",
  "buckinghamgm.com",
]);

export type PhotoUrlCheck = {
  ok: boolean;
  reason?: string;
  normalizedUrl?: string;
};

export function checkMarketplacePhotoUrl(rawUrl: string): PhotoUrlCheck {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "only https allowed" };
  }
  if (!MARKETPLACE_PHOTO_ALLOWED_HOSTS.has(parsed.hostname)) {
    return { ok: false, reason: `host not allowlisted: ${parsed.hostname}` };
  }
  return { ok: true, normalizedUrl: parsed.toString() };
}
