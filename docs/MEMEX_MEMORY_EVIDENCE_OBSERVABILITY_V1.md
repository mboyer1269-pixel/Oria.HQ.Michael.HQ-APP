# Memex Memory Evidence Observability v1

**Status:** v1 · read-only · Oria HQ only  
**Depends on:** PR #332 (Memex read-only corridor) · PR #333 (Memory Evidence summary in Joris)  
**Doctrine:** Oria = GOVERN · Memex = ORIENT · Evidence = preuve

## Purpose

Document how operators and agents can **observe** Memex Memory Evidence enrichment without expanding the #332 corridor or touching Sentinelle / Ledger authority.

Observability here means: structured metadata, compact context blocks, and explicit fallback signals — not raw memory dumps or new MCP surfaces.

## Where evidence is produced, injected, and logged

| Stage | Module | What happens |
|-------|--------|----------------|
| Enrichment | `src/server/joris/memex-context-source.ts` | After #332 handshake + read tool + Memory Evidence Pack validation |
| Summary | `src/server/joris/memex-memory-evidence-summary.ts` | `summarizeMemexMemoryEvidence` → `MemexMemoryEvidenceSummary` |
| Context block | same | `formatMemexMemoryEvidenceSummaryForContext` appended **only on enriched** path |
| Joris hook | `src/server/joris/brain.ts` | Uses enriched `memoryContext` when status is `enriched`; always logs observability payload |
| Structured log | `joris.memex.summary` | `buildMemexMemoryEvidenceObservabilityPayload` — counts/labels only |

## Field reference

### `sourceCount`

Number of provenance entries in the validated Memory Evidence Pack. Zero when no pack was injected. Never inferred from Memex tool output alone.

### `confidence`

Derived from pack `trustLevel`:

| trustLevel | confidence |
|------------|------------|
| verified | high |
| active | medium |
| proposed / untrusted | low |
| no pack | none |

Advisory only — does not grant tool authority or override Oria model policy.

### `freshness`

- `oldestIso` / `newestIso` — timestamps from the pack freshness window
- `ageDays` — days between `newestIso` and invocation time

Unavailable (null) when no pack exists.

### `limitations`

Fixed disclaimers plus pack-specific notes (redactions applied, conflicts marked). Always present so agents never over-trust memory. Standard lines include read-only v1 scope and Oria authority retention.

### `fallbackReasons`

- **Enriched:** empty array; context block shows `fallbackReasons: none`
- **Unavailable / handshake_failed / fallback:** contains the trace reason string (in context block and summary object)

When Memex fails, `memoryContext` from vault/lessons stays **unchanged** — only the summary object carries fallback metadata.

## Structured log payload (`joris.memex.summary`)

Log-safe fields only (via `buildMemexMemoryEvidenceObservabilityPayload`):

```json
{
  "status": "enriched | unavailable | handshake_failed | fallback | skipped",
  "sourceCount": 0,
  "confidence": "none | low | medium | high",
  "ageDays": null,
  "fallbackReasonCount": 0,
  "evidencePackValid": false
}
```

## Intentionally NOT exposed

| Excluded | Why |
|----------|-----|
| Raw memory / librarian brief text | Prompt-injection surface; lives in gated context merge only |
| Secrets, tokens, API keys | Never logged; redaction happens upstream in #332 client |
| Full `memoryIds` or provenance bodies in logs | Metadata counts only in observability payload |
| Tool authority / Sentinelle bypass signals | Memory cannot authorize tools (#331 canon) |
| Ledger mutation hints | Ledger unchanged; evidence is display-only |
| MCP transport details | #332 corridor unchanged |
| Fallback reason **text** in logs | Count only — reason text stays in trace/summary for agent context, not log lines |

## Compactness

Formatted summary blocks must stay ≤ `MEMEX_EVIDENCE_SUMMARY_BLOCK_MAX_CHARS` (1200). Tests enforce compactness and absence of raw memory content in the formatted block.

## Preview surface (PR #335)

For selected Joris intents only (`board.consult`, `brief.generate`), when `memoryContext` exists, a short **Memex Evidence Preview** block is appended to the summary via `buildMemexMemoryEvidencePreview` / `withMemexEvidencePreview`.

| Allowed in preview | Excluded |
|--------------------|----------|
| status, sourceCount, confidence, freshnessAgeDays | Raw memory / librarian brief text |
| limitationsCount + short labels (`advisory-only`, …) | Provenance paths, memoryIds, namespaces |
| fallbackReason count + truncated reason | Secrets, tool authority signals |

Header always includes: `read-only · advisory · no execution authorized`.

Other intents (calendar, mission, governance, etc.) are unchanged. Memex enrichment and fallback behavior in `memex-context-source.ts` is unchanged.

## Corridor preservation (#332)

This document and observability helpers add **no** new MCP tools, transport paths, allowlist entries, write operations, or DB persistence. Handshake gate and fail-closed fallback behavior are unchanged.

## Related docs

- `docs/MEMEX_READONLY_CONTEXT_SOURCE_V1.md` — corridor + handshake
- `docs/AGENT_EVIDENCE_PACKS_V1.md` — Memory Evidence Pack canon (#331)
