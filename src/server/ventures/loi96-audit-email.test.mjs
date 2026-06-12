#!/usr/bin/env node
// Pure unit tests for the Loi 96 audit email builder.
import assert from "node:assert/strict";
import test from "node:test";

const { buildLoi96AuditEmail } = await import("./loi96-audit-email.ts");

const target = {
  name: "Métal Leetwo inc.",
  domain: "leetwo.com",
  tier: 1,
  status: "audit_to_rebuild",
  audit: null,
  contact: "sales@leetwo.com",
  angle: "Liste OQLF + certifié marchandises contrôlées (contrats publics en jeu)",
  sentDate: null,
  replyDate: null,
  signedValue: 0,
};

test("subject names the domain and the law", () => {
  const email = buildLoi96AuditEmail(target);
  assert.ok(email.subject.includes("leetwo.com"));
  assert.ok(email.subject.includes("Loi 96"));
});

test("body is personalized with the angle and company name", () => {
  const email = buildLoi96AuditEmail(target);
  assert.ok(email.body.includes("Liste OQLF + certifié marchandises contrôlées"));
  assert.ok(email.body.includes("Métal Leetwo"));
  assert.ok(!email.body.includes("Métal Leetwo inc."), "inc. suffix stripped");
});

test("mandatory guardrails: no-legal-advice disclaimer + opt-out + AI disclosure", () => {
  const email = buildLoi96AuditEmail(target);
  assert.ok(email.body.includes("ne constitue\npas un avis juridique") || email.body.includes("ne constitue pas un avis juridique"));
  assert.ok(email.body.toLowerCase().includes("retirer"));
  assert.ok(email.body.includes("agents Oria HQ"));
});

test("sells risk elimination, not translation", () => {
  const email = buildLoi96AuditEmail(target);
  assert.ok(email.body.includes("OQLF"));
  assert.ok(email.body.includes("prix fixe"));
});
