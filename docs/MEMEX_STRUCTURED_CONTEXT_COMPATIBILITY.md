# Memex structured context compatibility

HQ now reads `agentmemory_graph_query` because its workspace-level context input has no Memex center entity ID. `agentmemory_context_pack` requires an existing center ID and cannot discover that ID itself. The added capability is read-only; proposal and vault tools remain forbidden at the call boundary. Handshake discovery ignores unrelated server capabilities instead of refusing a server that also supports writes.

Only structured records with an actual ID, exact namespace, nonempty declared source, valid stored timestamp and current status (`active` or `verified`) are considered. They are represented as a system retrieval with `trustLevel: untrusted`, never as human-authored or independently verified. Missing evidence, raw librarian prose, expired records, empty results and oversized payloads preserve existing HQ context. A task echo cannot become a memory. Freshness uses the stored record timestamp, not the retrieval time.

The bridge trusts the authenticated configured Memex instance to report its records; it does not independently certify authorship. A proposal can declare status and zone in its properties, so these values never elevate the HQ evidence trust level. Existing memories without a source or timestamp are excluded rather than automatically relabeled.

## Namespace migration

Workspace IDs matching `[A-Za-z0-9][A-Za-z0-9_.-]{0,110}` map exactly to `org:workspace:<id>`, preserving case and punctuation. Other IDs map to `org:workspace-sha256:<sha256 of exact UTF-8 id>`. Distinct prefixes separate raw IDs from hashes. No lowercasing, character deletion or truncation is used.

This replaces the incompatible older dotted mapping. Existing graph data is not renamed or copied. Operators must deliberately migrate the appropriate project's records, or configure a future explicit mapping, and re-mint remote handles for the resulting exact namespace. Other HQ evidence sources continue accepting their legacy dotted namespaces.

## Synthetic cross-repository proof

Set `MEMEX_CORE_TEST_ROOT` to an explicit Memex checkout and run:

```text
node --experimental-strip-types --test src/server/mcp/memex-live-contract.test.mjs
```

This uses the actual Memex graph, capability list and guarded handlers with an in-memory database. It verifies a reviewed record reaches HQ evidence, foreign-project and unproven records do not, and only the read query is called. It starts no service and reads no production vault. Without the test-root setting, this optional test is skipped.
