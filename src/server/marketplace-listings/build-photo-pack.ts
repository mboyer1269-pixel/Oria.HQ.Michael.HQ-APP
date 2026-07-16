// src/server/marketplace-listings/build-photo-pack.ts
//
// Fetch allowlisted inventory photos and package as a ZIP for manual Marketplace upload.
// Prepare-only — no Facebook publish.

import { checkMarketplacePhotoUrl } from "./photo-url-allowlist";
import { buildZipStore, type ZipStoreEntry } from "./zip-store";

const MAX_PHOTOS = 20;
const MAX_BYTES_PER_PHOTO = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

export type PhotoPackFile = {
  name: string;
  contentType: string;
  bytes: number;
  sourceUrl: string;
};

export type PhotoPackResult =
  | {
      ok: true;
      zip: Uint8Array;
      filename: string;
      files: PhotoPackFile[];
      skipped: Array<{ url: string; reason: string }>;
    }
  | { ok: false; errors: string[]; skipped: Array<{ url: string; reason: string }> };

function extensionForContentType(contentType: string, url: string): string {
  const ct = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (ct === "image/jpeg" || ct === "image/jpg") return "jpg";
  if (ct === "image/png") return "png";
  if (ct === "image/webp") return "webp";
  if (ct === "image/gif") return "gif";
  const path = url.split("?")[0] ?? url;
  const m = path.match(/\.(jpe?g|png|webp|gif)$/i);
  if (m) return m[1]!.toLowerCase().replace("jpeg", "jpg");
  return "jpg";
}

function slugifyStock(stockId: string): string {
  return stockId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 48) || "stock";
}

async function fetchPhotoBytes(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; data: Uint8Array; contentType: string } | { ok: false; reason: string }> {
  const check = checkMarketplacePhotoUrl(url);
  if (!check.ok || !check.normalizedUrl) {
    return { ok: false, reason: check.reason ?? "url rejected" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(check.normalizedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "OriaHQ-PhotoPack/1.0 (+prepare-only; manual Marketplace upload)",
      },
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return { ok: false, reason: `not an image (${contentType})` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) return { ok: false, reason: "empty body" };
    if (buf.length > MAX_BYTES_PER_PHOTO) {
      return { ok: false, reason: `image too large (>${MAX_BYTES_PER_PHOTO} bytes)` };
    }
    return { ok: true, data: buf, contentType };
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { ok: false, reason: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Download allowlisted photo URLs and return a ZIP ready for the operator's gallery.
 */
export async function buildMarketplacePhotoPack(input: {
  photoUrls: readonly string[];
  stockId: string;
  fetchImpl?: typeof fetch;
}): Promise<PhotoPackResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const skipped: Array<{ url: string; reason: string }> = [];
  const entries: ZipStoreEntry[] = [];
  const files: PhotoPackFile[] = [];

  const unique = [...new Set(input.photoUrls.map((u) => u.trim()).filter(Boolean))].slice(
    0,
    MAX_PHOTOS,
  );

  if (unique.length === 0) {
    return { ok: false, errors: ["no photo URLs to pack"], skipped };
  }

  let index = 0;
  for (const url of unique) {
    const fetched = await fetchPhotoBytes(url, fetchImpl);
    if (!fetched.ok) {
      skipped.push({ url, reason: fetched.reason });
      continue;
    }
    index += 1;
    const ext = extensionForContentType(fetched.contentType, url);
    const name = `${String(index).padStart(2, "0")}.${ext}`;
    entries.push({ name, data: fetched.data });
    files.push({
      name,
      contentType: fetched.contentType,
      bytes: fetched.data.length,
      sourceUrl: url,
    });
  }

  if (entries.length === 0) {
    return {
      ok: false,
      errors: ["no photos could be downloaded from allowlisted hosts"],
      skipped,
    };
  }

  // Operator cheat-sheet inside the ZIP
  const readme = new TextEncoder().encode(
    [
      "Pack photos Marketplace — Buckingham GM / Oria",
      "Prepare-only : Oria ne publie pas sur Facebook.",
      "",
      "1. Ouvre ce ZIP.",
      "2. Enregistre les images dans ta galerie / Photos.",
      "3. Sur Marketplace → Créer une annonce → ajoute ces photos.",
      "4. Colle titre + description depuis le Sales Desk.",
      "",
      `Stock : ${input.stockId}`,
      `Fichiers : ${files.map((f) => f.name).join(", ")}`,
      skipped.length > 0
        ? `Ignorées : ${skipped.map((s) => `${s.url} (${s.reason})`).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  entries.push({ name: "LISEZMOI.txt", data: readme });

  const zip = buildZipStore(entries);
  const filename = `marketplace-photos-${slugifyStock(input.stockId)}.zip`;

  return { ok: true, zip, filename, files, skipped };
}
