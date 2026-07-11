// src/server/inventory/public-inventory-allowlist.ts
//
// Host/path allowlist for public dealership inventory HTML fetch.
// No credentials. Expanding the allowlist is a deliberate change.

export const PUBLIC_INVENTORY_ALLOWED_HOSTS = new Set(["www.buckinghamgm.com", "buckinghamgm.com"]);

export const PUBLIC_INVENTORY_ALLOWED_PATH_PREFIXES = [
  "/neufs/inventaire/",
  "/occasion/inventaire/",
  "/occasion/",
  "/neufs/",
] as const;

export const BUCKINGHAM_DEFAULT_INVENTORY_URLS = [
  "https://www.buckinghamgm.com/neufs/inventaire/recherche.html",
  "https://www.buckinghamgm.com/occasion/recherche.html",
] as const;

export type AllowlistCheck = {
  ok: boolean;
  reason?: string;
  normalizedUrl?: string;
};

export function checkPublicInventoryUrl(rawUrl: string): AllowlistCheck {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "only https allowed" };
  }
  if (!PUBLIC_INVENTORY_ALLOWED_HOSTS.has(parsed.hostname)) {
    return { ok: false, reason: `host not allowlisted: ${parsed.hostname}` };
  }
  const pathOk = PUBLIC_INVENTORY_ALLOWED_PATH_PREFIXES.some((prefix) =>
    parsed.pathname.startsWith(prefix),
  );
  if (!pathOk) {
    return { ok: false, reason: `path not allowlisted: ${parsed.pathname}` };
  }
  return { ok: true, normalizedUrl: parsed.toString() };
}
