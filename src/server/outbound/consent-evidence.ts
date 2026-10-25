import type { OutboundBatch } from "./outbound-types.ts";

/** A label alone is not recorded proof of the right to contact someone. */
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
