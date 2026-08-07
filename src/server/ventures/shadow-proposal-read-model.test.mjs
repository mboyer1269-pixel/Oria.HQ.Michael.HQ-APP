#!/usr/bin/env node

// src/server/ventures/shadow-proposal-read-model.test.mjs
//
// V7 Phase 1 step 4a — retrieving a shadow proposal for pairing.
//
// Exercised here:
//   * retrieval is by venture + recency; proposalId is carried, never searched;
//   * reconstruction from ledger metadata is LOSSY and says so;
//   * a partial rebuild is refused, never silently completed;
//   * the metadata key paths the prepared index depends on are pinned, so
//     moving one breaks a test instead of quietly degrading a query to a scan.

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

const {
  SHADOW_PROPOSAL_MAX_AGE_DAYS,
  findLatestShadowProposal,
  reconstructProposalFromLedger,
} = await jiti.import(path.join(__dirname, "shadow-proposal-read-model.ts"));

const {
  SHADOW_PROPOSAL_ACTION_TYPE,
  buildProposalLedgerMetadata,
  parseShadowEvidence,
} = await jiti.import(path.join(__dirname, "venture-score-shadow-runner.ts"));

const { SCORE_DIMENSIONS } = await jiti.import(
  path.join(projectRoot, "src/features/ventures/venture-scoring.ts"),
);
const { buildVentureScoreProposal } = await jiti.import(
  path.join(projectRoot, "src/features/ventures/venture-score-proposal.ts"),
);

const DIMENSIONS = SCORE_DIMENSIONS.map((d) => d.key);
const ctx = { workspace: { id: "workspace_test" }, userId: "owner_1", storagePreference: "local" };
const NOW = new Date("2026-08-05T12:00:00.000Z");

function proposalFor(ventureId, proposalId) {
  const parsed = parseShadowEvidence({
    evidence: DIMENSIONS.map((dimension, index) => ({
      dimension,
      value: 7,
      rationale: `Because of ${dimension}.`,
      source:
        index < 3
          ? { kind: "external", url: `https://example.com/s-${index}` }
          : { kind: "internal", ref: `venture:${dimension}` },
    })),
  });

  return buildVentureScoreProposal({
    proposalId,
    ventureId,
    workspaceId: ctx.workspace.id,
    proposedBy: "inventor",
    proposedAt: NOW.toISOString(),
    evidence: parsed.evidence,
  }).proposal;
}

/** A ledger row exactly as the runner would have written it. */
function ledgerEntry(ventureId, proposalId, { createdAt = NOW.toISOString(), actionType } = {}) {
  return {
    actionType: actionType ?? SHADOW_PROPOSAL_ACTION_TYPE,
    createdAt,
    metadata: buildProposalLedgerMetadata(proposalFor(ventureId, proposalId), []),
  };
}

const listing = (entries) => async () => ({ workspaceId: ctx.workspace.id, entries, source: "local" });

test("Shadow proposal read model — key paths (V7 Phase 1 step 4a)", async (t) => {
  await t.test("the metadata carries proposalId and ventureId at fixed paths", () => {
    // The prepared partial index keys on metadata->>'ventureId'. Moving either
    // key would leave the query correct but unindexed — a silent degradation to
    // a full scan with nothing failing. This pins both paths.
    const metadata = buildProposalLedgerMetadata(proposalFor("venture_1", "prop_1"), []);

    assert.equal(metadata.proposalId, "prop_1", "proposalId must sit at metadata.proposalId");
    assert.equal(metadata.ventureId, "venture_1", "ventureId must sit at metadata.ventureId");
  });

  await t.test("proposalId is minted by the domain, not derived from a ledger row", () => {
    const proposal = proposalFor("venture_1", "prop_abc");
    // It exists on the in-memory object, before any persistence.
    assert.equal(proposal.proposalId, "prop_abc");
  });
});

test("Shadow proposal read model — lossy reconstruction (V7 Phase 1 step 4a)", async (t) => {
  await t.test("a well-formed row rebuilds into a comparable proposal", () => {
    const lookup = reconstructProposalFromLedger(ledgerEntry("venture_1", "prop_1"));

    assert.equal(lookup.status, "found");
    assert.equal(lookup.result.proposal.proposalId, "prop_1");
    assert.equal(lookup.result.proposal.ventureId, "venture_1");
    assert.equal(lookup.result.proposal.evidence.length, 11);
  });

  await t.test("the loss is declared, not hidden", () => {
    // Rationales were truncated to 240 chars on the way in. A rebuilt proposal
    // is fit for measuring divergence — which reads values — and unfit for
    // anything needing the agent's original wording.
    const lookup = reconstructProposalFromLedger(ledgerEntry("venture_1", "prop_1"));
    assert.equal(lookup.result.loss.rationalesTruncated, true);
  });

  await t.test("a missing dimension refuses rather than rebuilding partially", () => {
    // A partial rebuild would yield a divergence number that looks
    // authoritative while comparing against values never proposed.
    const entry = ledgerEntry("venture_1", "prop_1");
    entry.metadata.dimensions = entry.metadata.dimensions.slice(0, 5);

    const lookup = reconstructProposalFromLedger(entry);
    assert.equal(lookup.status, "absent");
    assert.equal(lookup.reason, "dimension_mismatch");
  });

  await t.test("malformed metadata is refused with a named reason", () => {
    for (const metadata of [null, "nope", {}, { ventureId: "v1" }]) {
      const lookup = reconstructProposalFromLedger({ metadata, createdAt: NOW.toISOString() });
      assert.equal(lookup.status, "absent");
      assert.equal(lookup.reason, "malformed_metadata");
    }
  });

  await t.test("source kind survives the round trip", () => {
    const lookup = reconstructProposalFromLedger(ledgerEntry("venture_1", "prop_1"));
    const kinds = lookup.result.proposal.evidence.map((e) => e.source.kind);

    assert.equal(kinds.filter((k) => k === "external").length, 3);
    assert.equal(kinds.filter((k) => k === "internal").length, 8);
  });
});

test("Shadow proposal read model — bounded lookup (V7 Phase 1 step 4a)", async (t) => {
  await t.test("retrieval is by venture, and returns the most recent match", async () => {
    const older = ledgerEntry("venture_1", "prop_old", {
      createdAt: new Date(NOW.getTime() - 2 * 86400000).toISOString(),
    });
    const newer = ledgerEntry("venture_1", "prop_new");

    // The ledger returns most-recent-first.
    const lookup = await findLatestShadowProposal(ctx, "venture_1", {
      listLedger: listing([newer, older]),
      now: () => NOW,
    });

    assert.equal(lookup.status, "found");
    assert.equal(lookup.result.proposal.proposalId, "prop_new");
  });

  await t.test("another venture's proposal is never returned", async () => {
    const lookup = await findLatestShadowProposal(ctx, "venture_1", {
      listLedger: listing([ledgerEntry("venture_2", "prop_other")]),
      now: () => NOW,
    });

    assert.equal(lookup.status, "absent");
    assert.equal(lookup.reason, "not_found");
  });

  await t.test("rows of another action type are ignored", async () => {
    const lookup = await findLatestShadowProposal(ctx, "venture_1", {
      listLedger: listing([
        ledgerEntry("venture_1", "prop_1", { actionType: "venture.score.shadow_outcome" }),
      ]),
      now: () => NOW,
    });

    assert.equal(lookup.status, "absent");
  });

  await t.test("a proposal older than the window is not pairable", async () => {
    // Age is a correctness bound before it is a performance one: a proposal far
    // older than the decision is not a measurement of that decision.
    const stale = ledgerEntry("venture_1", "prop_stale", {
      createdAt: new Date(NOW.getTime() - (SHADOW_PROPOSAL_MAX_AGE_DAYS + 1) * 86400000).toISOString(),
    });

    const lookup = await findLatestShadowProposal(ctx, "venture_1", {
      listLedger: listing([stale]),
      now: () => NOW,
    });

    assert.equal(lookup.status, "absent");
    assert.equal(lookup.reason, "not_found");
  });

  await t.test("the scan is bounded by an explicit row cap", async () => {
    let requestedLimit;
    await findLatestShadowProposal(ctx, "venture_1", {
      listLedger: async (input) => {
        requestedLimit = input.limit;
        return { workspaceId: ctx.workspace.id, entries: [], source: "local" };
      },
      now: () => NOW,
      scanLimit: 42,
    });

    assert.equal(requestedLimit, 42, "the cap must reach the ledger query, not be applied after");
  });

  await t.test("a ledger read failure is absent, never a throw", async () => {
    // The caller is the owner's live scoring path; a missing measurement must
    // not disturb the decision being recorded.
    const lookup = await findLatestShadowProposal(ctx, "venture_1", {
      listLedger: async () => {
        throw new Error("ledger down");
      },
      now: () => NOW,
    });

    assert.equal(lookup.status, "absent");
    assert.equal(lookup.reason, "not_found");
  });
});
