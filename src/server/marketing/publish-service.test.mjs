#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "development";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const serviceMod = await jiti.import(path.join(__dirname, "publish-service.ts"));
const storeMod = await jiti.import(path.join(__dirname, "publication-store.ts"));
const publisherMod = await jiti.import(path.join(__dirname, "facebook-page-publisher.ts"));
const listingStoreMod = await jiti.import(
  path.join(projectRoot, "src/server/marketplace-listings/listing-store.ts"),
);

const { runPublisherAgent } = serviceMod;
const {
  clearSocialPublicationStore,
  listSocialPublications,
  markPublicationPublishedManual,
} = storeMod;
const { createFacebookPagePublisher, createFacebookPagePublisherFromEnv } = publisherMod;
const { clearMarketplaceListingStore, getMarketplaceListing } = listingStoreMod;

const NOW = "2026-07-13T12:00:00.000Z";
const WS = "ws_test_publisher";

function vehicle(overrides = {}) {
  return {
    stockId: "26001-NEUF",
    year: 2026,
    make: "Chevrolet",
    model: "Trax",
    trim: "LT",
    condition: "new",
    priceCad: 28999,
    photoUrls: [
      "https://cdn.example.com/1.jpg",
      "https://cdn.example.com/2.jpg",
      "https://cdn.example.com/3.jpg",
    ],
    listingUrl: "https://www.buckinghamgm.com/neufs/trax-26001",
    ...overrides,
  };
}

function reset() {
  clearSocialPublicationStore();
  clearMarketplaceListingStore();
}

test("publisher agent", async (t) => {
  await t.test("auto-pilot publishes page post + queues marketplace packet", async () => {
    reset();
    const calls = [];
    const fakePublisher = {
      async publishPost(input) {
        calls.push(input);
        return { ok: true, postId: "123_456", postUrl: "https://www.facebook.com/123_456" };
      },
    };

    const result = await runPublisherAgent({
      workspaceId: WS,
      mode: "auto_pilot",
      nowIso: NOW,
      vehiclesOverride: [vehicle()],
      pagePublisher: fakePublisher,
    });

    assert.equal(result.ok, true, result.ok ? "" : result.errors.join("; "));
    assert.equal(result.pageConnected, true);
    assert.equal(result.publications.length, 2);

    const pagePub = result.publications.find((p) => p.channel === "facebook_page");
    assert.equal(pagePub.status, "published_auto");
    assert.equal(pagePub.mode, "auto_api");
    assert.equal(pagePub.postId, "123_456");
    assert.match(pagePub.message, /Trax/);
    assert.equal(calls.length, 1);
    assert.match(calls[0].linkUrl, /utm_medium=oria_publisher/);

    const mktPub = result.publications.find((p) => p.channel === "marketplace");
    assert.equal(mktPub.status, "queued");
    assert.equal(mktPub.mode, "assisted_manual");
    assert.ok(mktPub.packetId, "marketplace publication links its listing packet");
    const packet = getMarketplaceListing(WS, mktPub.packetId);
    assert.ok(packet);
    assert.equal(packet.requiresManualPublish, true);

    assert.equal(listSocialPublications(WS).length, 2);
  });

  await t.test("without page token in dev, page post is simulated (dry-run)", async () => {
    reset();
    const result = await runPublisherAgent({
      workspaceId: WS,
      mode: "single",
      stockId: "26001-NEUF",
      channels: ["facebook_page"],
      nowIso: NOW,
      vehiclesOverride: [vehicle()],
      pagePublisher: null,
      allowSimulated: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.pageConnected, false);
    assert.equal(result.publications[0].mode, "simulated");
    assert.equal(result.publications[0].status, "published_auto");
    assert.match(result.summaryFr, /simulation/);
  });

  await t.test("without token and without simulation, publication stays queued", async () => {
    reset();
    const result = await runPublisherAgent({
      workspaceId: WS,
      mode: "single",
      stockId: "26001-NEUF",
      channels: ["facebook_page"],
      nowIso: NOW,
      vehiclesOverride: [vehicle()],
      pagePublisher: null,
      allowSimulated: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.publications[0].status, "queued");
    assert.equal(result.publications[0].mode, "assisted_manual");
  });

  await t.test("failed Graph publish is recorded with the error", async () => {
    reset();
    const failing = {
      async publishPost() {
        return { ok: false, error: "Graph API: (#200) permissions", retryable: false };
      },
    };
    const result = await runPublisherAgent({
      workspaceId: WS,
      mode: "single",
      stockId: "26001-NEUF",
      channels: ["facebook_page"],
      nowIso: NOW,
      vehiclesOverride: [vehicle()],
      pagePublisher: failing,
    });
    assert.equal(result.ok, true);
    assert.equal(result.publications[0].status, "failed");
    assert.match(result.publications[0].error, /permissions/);
  });

  await t.test("auto-pilot cooldown prevents re-spamming the same stock", async () => {
    reset();
    const first = await runPublisherAgent({
      workspaceId: WS,
      mode: "auto_pilot",
      channels: ["facebook_page"],
      nowIso: NOW,
      vehiclesOverride: [vehicle()],
      pagePublisher: null,
      allowSimulated: true,
    });
    assert.equal(first.ok, true);

    const second = await runPublisherAgent({
      workspaceId: WS,
      mode: "auto_pilot",
      channels: ["facebook_page"],
      nowIso: "2026-07-14T12:00:00.000Z",
      vehiclesOverride: [vehicle()],
      pagePublisher: null,
      allowSimulated: true,
    });
    assert.equal(second.ok, false);
    assert.match(second.errors[0], /cooldown/);
  });

  await t.test("empty inventory fails with a clear operator message", async () => {
    reset();
    const result = await runPublisherAgent({
      workspaceId: WS,
      mode: "auto_pilot",
      nowIso: NOW,
      vehiclesOverride: [],
      pagePublisher: null,
    });
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /Sync/);
  });

  await t.test("mark_published_manual flips a queued marketplace publication", async () => {
    reset();
    const run = await runPublisherAgent({
      workspaceId: WS,
      mode: "single",
      stockId: "26001-NEUF",
      channels: ["marketplace"],
      nowIso: NOW,
      vehiclesOverride: [vehicle()],
      pagePublisher: null,
    });
    assert.equal(run.ok, true);
    const pub = run.publications[0];
    const updated = markPublicationPublishedManual(WS, pub.publicationId, "2026-07-13T13:00:00.000Z");
    assert.equal(updated.status, "published_manual");
    assert.ok(updated.publishedAt);
  });
});

test("facebook page publisher adapter", async (t) => {
  await t.test("env factory returns null without credentials", () => {
    assert.equal(createFacebookPagePublisherFromEnv({}), null);
    assert.equal(createFacebookPagePublisherFromEnv({ FACEBOOK_PAGE_ID: "1" }), null);
  });

  await t.test("publishes photos then feed post via Graph API", async () => {
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ url: String(url), body: String(init.body) });
      if (String(url).includes("/photos")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: `photo_${requests.length}` }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "page_post_1" }),
      };
    };

    const publisher = createFacebookPagePublisher({
      pageId: "PAGE1",
      accessToken: "TOKEN",
      fetchImpl,
    });
    const outcome = await publisher.publishPost({
      message: "Bonjour Gatineau",
      linkUrl: "https://www.buckinghamgm.com/x",
      photoUrls: ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"],
    });

    assert.equal(outcome.ok, true);
    assert.equal(outcome.postId, "page_post_1");
    assert.equal(requests.length, 3); // 2 photo uploads + 1 feed post
    assert.ok(requests[0].url.includes("/PAGE1/photos"));
    assert.ok(requests[2].url.includes("/PAGE1/feed"));
    assert.ok(requests[2].body.includes("attached_media"));
  });

  await t.test("surfaces Graph API errors", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Invalid OAuth access token", code: 190 } }),
    });
    const publisher = createFacebookPagePublisher({
      pageId: "PAGE1",
      accessToken: "BAD",
      fetchImpl,
    });
    const outcome = await publisher.publishPost({
      message: "x",
      photoUrls: [],
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /Invalid OAuth/);
  });
});
