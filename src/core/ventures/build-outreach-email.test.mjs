#!/usr/bin/env node
// Tests for the generic outreach-email builder. Proves the model is venture-
// agnostic: a fictitious France / RGPD venture goes through the same builder
// with zero loi96-specific code.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("generic outreach builder", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(projectRoot, "src") },
  });
  const { buildOutreachEmail, interpolate, normalizeCompanyName } =
    await jiti.import(path.join(__dirname, "build-outreach-email.ts"));

  /** A completely different venture/market — no Quebec, no Loi 96. */
  const rgpdProfile = {
    ventureId: "rgpd-audit",
    displayName: "Audit RGPD",
    market: { country: "FR", language: "fr" },
    complianceDrivers: [{ id: "rgpd", label: "RGPD", authority: "CNIL" }],
    offer: {
      sell: "la réduction du risque de sanction CNIL",
      deliverable: "un audit gratuit",
      nextStep: "un appel de 15 minutes",
      pricingOptions: [],
      disclaimer: "-- Ceci n'est pas un avis juridique.",
      neverClaims: ["un avis juridique"],
    },
    icp: { description: "PME françaises traitant des données personnelles." },
    outreach: {
      channel: "email",
      language: "fr",
      tone: "factuel",
      mode: "template",
      template: {
        subject: "Risques RGPD repérés sur {{reference}}",
        body: "Bonjour,\n\nNous avons analysé {{reference}} ({{company}}) : {{angle}}.\nNous offrons {{deliverable}} puis {{nextStep}}.\n\n{{disclaimer}}",
      },
    },
  };

  const target = {
    id: "exemple.fr",
    name: "Exemple SARL",
    reference: "exemple.fr",
    angle: "formulaires sans base légale de consentement",
  };

  await t.test("interpolates the venture's template for any market", () => {
    const email = buildOutreachEmail(rgpdProfile, target);
    assert.ok(email.subject.includes("exemple.fr"));
    assert.ok(email.subject.includes("RGPD"));
    assert.ok(email.body.includes("Exemple SARL"));
    assert.ok(email.body.includes("formulaires sans base légale"));
    assert.ok(email.body.includes("un audit gratuit"));
    assert.ok(email.body.includes("un appel de 15 minutes"));
    assert.ok(email.body.includes("n'est pas un avis juridique"));
  });

  await t.test("normalizes a trailing corporate suffix", () => {
    assert.equal(normalizeCompanyName("Exemple SARL"), "Exemple SARL");
    assert.equal(normalizeCompanyName("Métal Leetwo inc."), "Métal Leetwo");
    assert.equal(normalizeCompanyName("Acme Ltd"), "Acme");
  });

  await t.test("fails loud on an unknown placeholder (never ships a {{token}})", () => {
    assert.throws(() => interpolate("Hello {{unknown}}", { name: "x" }), /unknown placeholder/);
  });

  await t.test("refuses to build in llm mode (handled elsewhere)", () => {
    const llmProfile = { ...rgpdProfile, outreach: { ...rgpdProfile.outreach, mode: "llm", template: undefined } };
    assert.throws(() => buildOutreachEmail(llmProfile, target), /template-mode/);
  });
});
