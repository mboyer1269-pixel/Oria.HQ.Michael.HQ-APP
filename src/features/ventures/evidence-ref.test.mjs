#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRef(overrides = {}) {
  return {
    kind: "stripe_charge",
    referenceId: "ch_test_001",
    isVerified: true,
    source: "stripe-dashboard",
    capturedAt: "2026-06-02T00:00:00.000Z",
    summary: "Customer ACME paid $500 via Stripe charge ch_test_001.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("EvidenceRef — typed revenue evidence", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "evidence-ref.ts"));
  const {
    EVIDENCE_KINDS,
    VERIFIED_FINANCIAL_KINDS,
    EVIDENCE_MIN_SUMMARY_LENGTH,
    LEGACY_EVIDENCE_SOURCE,
    LEGACY_EVIDENCE_CAPTURED_AT,
    validateEvidenceRef,
    isVagueEvidence,
    classifyEvidenceTrust,
    classifyEvidenceCollectionTrust,
    isVerifiedFinancialEvidence,
    hasVerifiedFinancialEvidence,
    validateCashEvidence,
    applyEvidenceConfidence,
    fromLegacyStringEvidence,
  } = mod;

  // -------------------------------------------------------------------------
  // Group 1 — Validation: accepts strong financial proofs
  // -------------------------------------------------------------------------
  await t.test("accepts strong financial proofs", async (t) => {
    await t.test("accepts a verified stripe_charge", () => {
      const result = validateEvidenceRef(makeRef({ kind: "stripe_charge" }));
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    await t.test("accepts a verified signed_loi", () => {
      const result = validateEvidenceRef(
        makeRef({
          kind: "signed_loi",
          referenceId: "loi-2026-014",
          summary: "ACME Corp signed a letter of intent for a 6-month pilot.",
        }),
      );
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    await t.test("exposes all seven evidence kinds", () => {
      assert.deepEqual([...EVIDENCE_KINDS], [
        "stripe_charge",
        "signed_loi",
        "email_reply",
        "analytics_event",
        "screenshot",
        "manual_note",
        "self_reported",
      ]);
    });

    await t.test("verified financial kinds are exactly stripe_charge and signed_loi", () => {
      assert.deepEqual([...VERIFIED_FINANCIAL_KINDS], ["stripe_charge", "signed_loi"]);
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Trust classification
  // -------------------------------------------------------------------------
  await t.test("trust classification", async (t) => {
    await t.test("verified stripe_charge is strongest", () => {
      assert.equal(classifyEvidenceTrust(makeRef({ kind: "stripe_charge" })), "strongest");
    });

    await t.test("verified signed_loi is high", () => {
      assert.equal(classifyEvidenceTrust(makeRef({ kind: "signed_loi" })), "high");
    });

    await t.test("verified email_reply is high", () => {
      assert.equal(classifyEvidenceTrust(makeRef({ kind: "email_reply" })), "high");
    });

    await t.test("verified analytics_event is medium", () => {
      assert.equal(classifyEvidenceTrust(makeRef({ kind: "analytics_event" })), "medium");
    });

    await t.test("verified screenshot is medium", () => {
      assert.equal(classifyEvidenceTrust(makeRef({ kind: "screenshot" })), "medium");
    });

    await t.test("manual_note is low trust (even if marked verified)", () => {
      assert.equal(classifyEvidenceTrust(makeRef({ kind: "manual_note", isVerified: true })), "low");
    });

    await t.test("self_reported is low trust (even if marked verified)", () => {
      assert.equal(classifyEvidenceTrust(makeRef({ kind: "self_reported", isVerified: true })), "low");
    });

    await t.test("unverified stripe_charge drops to low", () => {
      assert.equal(classifyEvidenceTrust(makeRef({ kind: "stripe_charge", isVerified: false })), "low");
    });

    await t.test("collection trust returns the highest level present", () => {
      const refs = [
        makeRef({ kind: "screenshot" }),       // medium
        makeRef({ kind: "stripe_charge" }),    // strongest
        makeRef({ kind: "manual_note" }),      // low
      ];
      assert.equal(classifyEvidenceCollectionTrust(refs), "strongest");
    });

    await t.test("collection trust of empty array is none", () => {
      assert.equal(classifyEvidenceCollectionTrust([]), "none");
    });
  });

  // -------------------------------------------------------------------------
  // Group 3 — Confidence reduction for unverified evidence
  // -------------------------------------------------------------------------
  await t.test("confidence reduction", async (t) => {
    await t.test("unverified evidence reduces confidence vs verified", () => {
      const verified = applyEvidenceConfidence(80, makeRef({ kind: "email_reply", isVerified: true }));
      const unverified = applyEvidenceConfidence(80, makeRef({ kind: "email_reply", isVerified: false }));
      assert.ok(unverified < verified, "unverified must score lower than verified");
    });

    await t.test("verified evidence keeps full confidence", () => {
      assert.equal(applyEvidenceConfidence(80, makeRef({ kind: "stripe_charge" })), 80);
    });

    await t.test("unverified evidence keeps half confidence", () => {
      assert.equal(applyEvidenceConfidence(80, makeRef({ kind: "email_reply", isVerified: false })), 40);
    });

    await t.test("manual_note is reduced even when marked verified", () => {
      assert.equal(applyEvidenceConfidence(80, makeRef({ kind: "manual_note", isVerified: true })), 40);
    });

    await t.test("confidence reduction is deterministic", () => {
      const ref = makeRef({ kind: "email_reply", isVerified: false });
      assert.equal(applyEvidenceConfidence(80, ref), applyEvidenceConfidence(80, ref));
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — Field validation
  // -------------------------------------------------------------------------
  await t.test("field validation", async (t) => {
    await t.test("rejects empty referenceId", () => {
      const result = validateEvidenceRef(makeRef({ referenceId: "   " }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("referenceId")));
    });

    await t.test("rejects empty source", () => {
      const result = validateEvidenceRef(makeRef({ source: "" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("source")));
    });

    await t.test("rejects empty summary", () => {
      const result = validateEvidenceRef(makeRef({ summary: "   " }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("summary must be non-empty")));
    });

    await t.test("rejects unknown kind", () => {
      const result = validateEvidenceRef(makeRef({ kind: "telepathy" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("kind")));
    });

    await t.test("rejects non-boolean isVerified", () => {
      const result = validateEvidenceRef(makeRef({ isVerified: "yes" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("isVerified")));
    });

    await t.test("rejects invalid capturedAt", () => {
      const result = validateEvidenceRef(makeRef({ capturedAt: "not-a-date" }));
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("capturedAt")));
    });

    await t.test("detects vague (non-empty but thin) summary", () => {
      const ref = makeRef({ summary: "ok" });
      assert.equal(isVagueEvidence(ref), true);
      const result = validateEvidenceRef(ref);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("vague")));
    });

    await t.test("a meaningful summary is not vague", () => {
      assert.equal(isVagueEvidence(makeRef()), false);
    });

    await t.test("min summary length constant is positive", () => {
      assert.ok(EVIDENCE_MIN_SUMMARY_LENGTH > 0);
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Financial proof gate for realized cash
  // -------------------------------------------------------------------------
  await t.test("financial proof for realized cash", async (t) => {
    await t.test("isVerifiedFinancialEvidence true for verified stripe_charge", () => {
      assert.equal(isVerifiedFinancialEvidence(makeRef({ kind: "stripe_charge" })), true);
    });

    await t.test("isVerifiedFinancialEvidence false for unverified stripe_charge", () => {
      assert.equal(isVerifiedFinancialEvidence(makeRef({ kind: "stripe_charge", isVerified: false })), false);
    });

    await t.test("isVerifiedFinancialEvidence false for verified email_reply", () => {
      assert.equal(isVerifiedFinancialEvidence(makeRef({ kind: "email_reply" })), false);
    });

    await t.test("cashGenerated > 0 requires verified financial evidence", () => {
      const none = validateCashEvidence(5000, []);
      assert.equal(none.valid, false);
      const withProof = validateCashEvidence(5000, [makeRef({ kind: "stripe_charge" })]);
      assert.equal(withProof.valid, true);
    });

    await t.test("signed_loi (verified) satisfies the cash gate", () => {
      const result = validateCashEvidence(5000, [makeRef({ kind: "signed_loi", referenceId: "loi-1", summary: "Signed LOI from ACME for pilot." })]);
      assert.equal(result.valid, true);
    });

    await t.test("manual_note alone cannot prove cash", () => {
      const result = validateCashEvidence(5000, [
        makeRef({ kind: "manual_note", isVerified: true, referenceId: "note-1", summary: "I think we got paid." }),
      ]);
      assert.equal(result.valid, false);
    });

    await t.test("self_reported alone cannot prove cash", () => {
      const result = validateCashEvidence(5000, [
        makeRef({ kind: "self_reported", isVerified: true, referenceId: "sr-1", summary: "Agent claims a payment came in." }),
      ]);
      assert.equal(result.valid, false);
    });

    await t.test("zero cash needs no evidence", () => {
      assert.equal(validateCashEvidence(0, []).valid, true);
    });

    await t.test("hasVerifiedFinancialEvidence scans a collection", () => {
      const refs = [makeRef({ kind: "screenshot" }), makeRef({ kind: "signed_loi", referenceId: "loi-2", summary: "Signed LOI doc on file." })];
      assert.equal(hasVerifiedFinancialEvidence(refs), true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — Legacy adapter
  // -------------------------------------------------------------------------
  await t.test("legacy adapter", async (t) => {
    await t.test("adapts legacy strings into unverified self_reported refs", () => {
      const refs = fromLegacyStringEvidence(["customer said yes", "saw interest on the call"]);
      assert.equal(refs.length, 2);
      for (const ref of refs) {
        assert.equal(ref.kind, "self_reported");
        assert.equal(ref.isVerified, false);
        assert.equal(ref.source, LEGACY_EVIDENCE_SOURCE);
      }
    });

    await t.test("legacy refs carry the original string as summary", () => {
      const refs = fromLegacyStringEvidence(["two buyers confirmed the pain"]);
      assert.equal(refs[0].summary, "two buyers confirmed the pain");
    });

    await t.test("legacy adapter is deterministic", () => {
      const input = ["a", "b", "c"];
      assert.deepEqual(fromLegacyStringEvidence(input), fromLegacyStringEvidence(input));
    });

    await t.test("legacy adapter uses a fixed sentinel capturedAt", () => {
      const refs = fromLegacyStringEvidence(["x evidence detail here"]);
      assert.equal(refs[0].capturedAt, LEGACY_EVIDENCE_CAPTURED_AT);
    });

    await t.test("empty legacy string still yields a non-empty summary", () => {
      const refs = fromLegacyStringEvidence([""]);
      assert.ok(refs[0].summary.trim().length > 0);
    });

    await t.test("adapted legacy refs are structurally valid", () => {
      const refs = fromLegacyStringEvidence(["a reasonably detailed legacy note"]);
      const result = validateEvidenceRef(refs[0]);
      assert.equal(result.valid, true);
    });

    await t.test("empty input yields empty output", () => {
      assert.deepEqual(fromLegacyStringEvidence([]), []);
    });
  });

  // -------------------------------------------------------------------------
  // Group 7 — Purity and determinism
  // -------------------------------------------------------------------------
  await t.test("purity and determinism", async (t) => {
    await t.test("validateEvidenceRef is synchronous", () => {
      assert.ok(!(validateEvidenceRef(makeRef()) instanceof Promise));
    });

    await t.test("validateEvidenceRef does not mutate input", () => {
      const ref = makeRef();
      const snapshot = JSON.stringify(ref);
      validateEvidenceRef(ref);
      assert.equal(JSON.stringify(ref), snapshot);
    });

    await t.test("classifyEvidenceTrust is deterministic", () => {
      const ref = makeRef({ kind: "analytics_event" });
      assert.equal(classifyEvidenceTrust(ref), classifyEvidenceTrust(ref));
    });

    await t.test("module exports only expected symbols", () => {
      const keys = Object.keys(mod);
      const expected = [
        "EVIDENCE_KINDS",
        "VERIFIED_FINANCIAL_KINDS",
        "EVIDENCE_MIN_SUMMARY_LENGTH",
        "UNVERIFIED_CONFIDENCE_FACTOR",
        "LEGACY_EVIDENCE_SOURCE",
        "LEGACY_EVIDENCE_CAPTURED_AT",
        "validateEvidenceRef",
        "isVagueEvidence",
        "classifyEvidenceTrust",
        "classifyEvidenceCollectionTrust",
        "isVerifiedFinancialEvidence",
        "hasVerifiedFinancialEvidence",
        "validateCashEvidence",
        "applyEvidenceConfidence",
        "fromLegacyStringEvidence",
      ];
      for (const key of expected) {
        assert.ok(keys.includes(key), `export "${key}" missing`);
      }
    });
  });
});
