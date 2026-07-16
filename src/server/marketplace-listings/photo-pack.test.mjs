#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const allowMod = await jiti.import(
  path.join(projectRoot, "src/server/marketplace-listings/photo-url-allowlist.ts"),
);
const zipMod = await jiti.import(
  path.join(projectRoot, "src/server/marketplace-listings/zip-store.ts"),
);
const packMod = await jiti.import(
  path.join(projectRoot, "src/server/marketplace-listings/build-photo-pack.ts"),
);

const { checkMarketplacePhotoUrl } = allowMod;
const { buildZipStore } = zipMod;
const { buildMarketplacePhotoPack } = packMod;

// Minimal valid JPEG (1x1)
const TINY_JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xff, 0xc4, 0x00, 0x14,
  0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xff, 0xd9,
]);

test("marketplace photo pack ZIP", async (t) => {
  await t.test("allowlist accepts d2cmedia https only", () => {
    assert.equal(
      checkMarketplacePhotoUrl(
        "https://imagescdn.d2cmedia.ca/path/Chevrolet-Trax-2026.jpg",
      ).ok,
      true,
    );
    assert.equal(checkMarketplacePhotoUrl("https://evil.example/x.jpg").ok, false);
    assert.equal(
      checkMarketplacePhotoUrl("http://imagescdn.d2cmedia.ca/path/x.jpg").ok,
      false,
    );
  });

  await t.test("zip store contains PK signatures", () => {
    const zip = buildZipStore([
      { name: "01.jpg", data: TINY_JPEG },
      { name: "LISEZMOI.txt", data: new TextEncoder().encode("hello") },
    ]);
    assert.equal(zip[0], 0x50); // P
    assert.equal(zip[1], 0x4b); // K
    assert.ok(zip.length > 50);
  });

  await t.test("buildMarketplacePhotoPack fetches allowlisted images", async () => {
    const fetchImpl = async (url) => {
      assert.match(String(url), /d2cmedia/);
      return {
        ok: true,
        headers: { get: (k) => (k.toLowerCase() === "content-type" ? "image/jpeg" : null) },
        arrayBuffer: async () => TINY_JPEG.buffer.slice(0),
      };
    };

    const result = await buildMarketplacePhotoPack({
      stockId: "stk_trax_1",
      photoUrls: [
        "https://imagescdn.d2cmedia.ca/demo/1.jpg",
        "https://imagescdn.d2cmedia.ca/demo/2.jpg",
        "https://evil.example/hack.jpg",
      ],
      fetchImpl,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.files.length, 2);
    assert.equal(result.skipped.length, 1);
    assert.match(result.filename, /marketplace-photos-stk_trax_1\.zip/);
    assert.equal(result.zip[0], 0x50);
  });
});
