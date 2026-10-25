import type { OutboundBatch } from "./outbound-types.ts";

/** HTTP evidence is an assertion, never a trusted record, even from the owner. */
export function neutralizeClientConsent(input: Pick<OutboundBatch, "consentBasis"> & Partial<Pick<OutboundBatch, "consentProvenance">>) {
  return {
    // A client-declared basis is a label, not proof. There is no server-side
    // evidence store to resolve it yet, so both "express" and "implied_verified"
    // fall back to manual review and can never mint an approval token.
    consentBasis: input.consentBasis === "implied_verified" || input.consentBasis === "express"
      ? "manual_review_required" as const
      : input.consentBasis,
    consentProvenance: (input.consentProvenance ?? []).map((ref) => ({ ...ref, isVerified: false })),
  };
}

/** For server-constructed records only; untrusted inputs must be neutralized first.
 * A label alone is not recorded proof of the right to contact someone. */
export function hasRecordedConsentProvenance(
  batch: Pick<OutboundBatch, "consentProvenance">,
): boolean {
  return Array.isArray(batch.consentProvenance) && batch.consentProvenance.some((ref) =>
    ref && ref.isVerified === true
    && !("provenance" in ref && ref.provenance === "simulated")
    && typeof ref.source === "string" && ref.source.trim().length > 0
    && typeof ref.referenceId === "string" && ref.referenceId.trim().length > 0
    && typeof ref.capturedAt === "string" && Number.isFinite(Date.parse(ref.capturedAt)),
  );
}
