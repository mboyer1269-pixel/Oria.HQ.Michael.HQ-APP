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

const mod = await jiti.import(path.join(__dirname, "social-publication.ts"));
const {
  buildAutoPilotPlan,
  buildUtmUrl,
  validateSocialPublication,
  vehicleLabel,
} = mod;

const NOW = "2026-07-13T12:00:00.000Z";

function vehicle(overrides = {}) {
  return {
    stockId: "26001-NEUF",
    year: 2026,
    make: "Chevrolet",
    model: "Trax",
    trim: "LT",
    condition: "new",
    priceCad: 28999,
    photoUrls: ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg", "https://cdn.example.com/3.jpg"],
    listingUrl: "https://www.buckinghamgm.com/neufs/trax-26001",
    ...overrides,
  };
}

test("social publication contracts", async (t) => {
  await t.test("buildUtmUrl tags the dealer link with campaign params", () => {
    const url = buildUtmUrl("https://www.buckinghamgm.com/neufs/trax", "26001-NEUF", "facebook_page");
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("utm_source"), "facebook");
    assert.equal(parsed.searchParams.get("utm_medium"), "oria_publisher");
    assert.equal(parsed.searchParams.get("utm_campaign"), "stock_26001-neuf");
  });

  await t.test("buildUtmUrl returns undefined without a listing url", () => {
    assert.equal(buildUtmUrl(undefined, "26001", "marketplace"), undefined);
  });

  await t.test("validateSocialPublication accepts a complete record", () => {
    const result = validateSocialPublication({
      publicationId: "pub_1",
      workspaceId: "ws_1",
      stockId: "26001-NEUF",
      vehicleLabel: "2026 Chevrolet Trax LT",
      channel: "facebook_page",
      message: "post",
      photoUrls: [],
      status: "queued",
      mode: "assisted_manual",
      rationale: "test",
      createdAt: NOW,
      updatedAt: NOW,
    });
    assert.equal(result.valid, true, result.errors.join("; "));
  });

  await t.test("validateSocialPublication rejects unknown channel/status", () => {
    const result = validateSocialPublication({
      publicationId: "pub_1",
      workspaceId: "ws_1",
      stockId: "26001",
      vehicleLabel: "x",
      channel: "instagram",
      message: "post",
      photoUrls: [],
      status: "nope",
      mode: "assisted_manual",
      rationale: "test",
      createdAt: NOW,
      updatedAt: NOW,
    });
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 2);
  });
});

test("auto-pilot plan", async (t) => {
  await t.test("scores photo-rich, priced, high-demand new vehicles first", () => {
    const strong = vehicle();
    const weak = vehicle({
      stockId: "U-9001",
      model: "Sonic",
      condition: "used",
      priceCad: undefined,
      photoUrls: ["https://cdn.example.com/x.jpg"],
      listingUrl: undefined,
    });
    const plan = buildAutoPilotPlan({
      vehicles: [weak, strong],
      recentPublications: [],
      nowIso: NOW,
      maxPerRun: 2,
    });
    assert.equal(plan.length, 2);
    assert.equal(plan[0].vehicle.stockId, "26001-NEUF");
    assert.ok(plan[0].score > plan[1].score);
    assert.ok(plan[0].reasons.some((r) => r.includes("photos")));
  });

  await t.test("skips vehicles without photos", () => {
    const plan = buildAutoPilotPlan({
      vehicles: [vehicle({ photoUrls: [] })],
      recentPublications: [],
      nowIso: NOW,
    });
    assert.equal(plan.length, 0);
  });

  await t.test("applies the per-stock cooldown", () => {
    const recent = [
      { stockId: "26001-NEUF", createdAt: "2026-07-10T12:00:00.000Z", status: "published_auto" },
    ];
    const plan = buildAutoPilotPlan({
      vehicles: [vehicle()],
      recentPublications: recent,
      nowIso: NOW,
      cooldownDays: 7,
    });
    assert.equal(plan.length, 0);

    const planAfterCooldown = buildAutoPilotPlan({
      vehicles: [vehicle()],
      recentPublications: recent,
      nowIso: "2026-07-20T12:00:00.000Z",
      cooldownDays: 7,
    });
    assert.equal(planAfterCooldown.length, 1);
  });

  await t.test("failed publications do not trigger the cooldown", () => {
    const plan = buildAutoPilotPlan({
      vehicles: [vehicle()],
      recentPublications: [
        { stockId: "26001-NEUF", createdAt: "2026-07-12T12:00:00.000Z", status: "failed" },
      ],
      nowIso: NOW,
    });
    assert.equal(plan.length, 1);
  });

  await t.test("caps the run size", () => {
    const many = Array.from({ length: 8 }, (_, i) => vehicle({ stockId: `S-${i}` }));
    const plan = buildAutoPilotPlan({
      vehicles: many,
      recentPublications: [],
      nowIso: NOW,
      maxPerRun: 3,
    });
    assert.equal(plan.length, 3);
  });
});

test("vehicleLabel composes year make model trim", () => {
  assert.equal(vehicleLabel(vehicle()), "2026 Chevrolet Trax LT");
  assert.equal(vehicleLabel(vehicle({ trim: undefined })), "2026 Chevrolet Trax");
});
