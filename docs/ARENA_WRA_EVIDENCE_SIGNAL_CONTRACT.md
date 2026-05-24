# Arena WRA Evidence Signal Contract

## Goal

Turn Arena candidates into action buckets for the Weekly Resource Allocation flow without inventing ROI.

## Evidence shape

```ts
type ArenaWraEvidence = {
  candidateId: string;
  assumedRevenueInfluencedCents: number;
  estimatedCostCents?: number;
  note?: string;
  source?: string;
};
```

- Evidence is explicit and deterministic on the server.
- No LLM, no external call, no Supabase write, no Mission type change.
- If no evidence is supplied, the candidate stays `not-evaluable`.

## Evidence quality

- `none`: no evidence object for the candidate
- `weak`: note/source missing, or revenue below the evidence floor
- `strong`: note + source present and revenue at or above the evidence floor

Evidence floor used by PR13: `25_000` cents.

## Bucket mapping

- `DEFER`: weak evidence, or strong evidence with incomplete ROI inputs
- `KILL`: strong evidence with negative ROI (`revenue < cost`)
- `FOCUS`: strong evidence, positive ROI, top-ranked candidate, and not capped by `risk=high` or `autonomy>=5`
- `GO`: strong evidence, positive ROI, but not top-ranked or capped by risk/autonomy

## Notes

- Arena scoring stays unchanged.
- WRA is a thin classification layer over Arena verdicts and explicit evidence.
- The evidence signal is a sidecar input, not a new database field.
