#!/usr/bin/env node

// Contact route critical paths (offline): input validation + public error
// mapping. No network, no env, no Supabase/Resend — pure helpers only.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

process.env.NODE_ENV = "development";

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

// Import via the same "@/" alias specifiers the runtime code uses, so jiti
// returns the SAME module instances (instanceof across the two modules works).
const { contactRequestSchema, mapContactApiError } = await jiti.import("@/server/contact/contact-request");
const { ContactLeadRepositoryError } = await jiti.import("@/server/contact/contact-lead-repository");

const validPayload = {
  name: "Jean Test",
  email: "JEAN@Example.COM",
  message: "Bonjour, ceci est un message de contact assez long.",
};

test("contact request validation", async (t) => {
  await t.test("accepts a valid payload, lowercases email, defaults source", () => {
    const parsed = contactRequestSchema.safeParse(validPayload);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.email, "jean@example.com");
    assert.equal(parsed.data.source, "suivia-contact-form");
  });

  await t.test("rejects a name shorter than 2 chars", () => {
    assert.equal(contactRequestSchema.safeParse({ ...validPayload, name: "X" }).success, false);
  });

  await t.test("rejects an invalid email", () => {
    assert.equal(contactRequestSchema.safeParse({ ...validPayload, email: "not-an-email" }).success, false);
  });

  await t.test("rejects a message shorter than 10 chars", () => {
    assert.equal(contactRequestSchema.safeParse({ ...validPayload, message: "court" }).success, false);
  });

  await t.test("rejects a non-object body", () => {
    assert.equal(contactRequestSchema.safeParse(null).success, false);
  });

  await t.test("keeps the honeypot field for the route to inspect", () => {
    const parsed = contactRequestSchema.safeParse({ ...validPayload, website: "http://spam.example" });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.website, "http://spam.example");
  });
});

test("contact API error mapping never leaks internals", async (t) => {
  await t.test("a repository error maps to a generic 503 + generic code (no raw detail)", () => {
    const raw = "duplicate key value violates unique constraint contact_leads_pkey";
    const mapped = mapContactApiError(new ContactLeadRepositoryError(raw, "CONTACT_LEAD_WRITE_FAILED"));

    assert.equal(mapped.status, 503);
    assert.equal(mapped.body.code, "CONTACT_LEAD_WRITE_FAILED");
    assert.equal(mapped.shouldLog, false);
    assert.ok(!JSON.stringify(mapped.body).includes(raw), "raw error detail must not be exposed");
  });

  await t.test("an unknown error maps to a generic 500 (no code, no internal detail)", () => {
    const mapped = mapContactApiError(new Error("Supabase service role key invalid at https://x.supabase.co"));

    assert.equal(mapped.status, 500);
    assert.equal(mapped.body.code, undefined);
    assert.equal(mapped.shouldLog, true);
    assert.ok(!JSON.stringify(mapped.body).toLowerCase().includes("supabase"), "internal detail must not be exposed");
  });
});
