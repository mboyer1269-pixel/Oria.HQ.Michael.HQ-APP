#!/usr/bin/env node

// src/server/ventures/shadow-outcome-hook.test.mjs
//
// V7 Phase 1 step 4a — the outcome hook.
//
// The hook runs on the owner's live scoring path, so what is tested here is
// mostly what it refuses to do: throw, mutate, or report a failure as an
// absence.

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

const { recordShadowOutcomeForVenture } = await jiti.import(
  path.join(__dirname, "shadow-outcome-hook.ts"),
);
const { parseShadowEvidence } = await jiti.import(
  path.join(__dirname, "venture-score-shadow-runner.ts"),
);
const { SCORE_DIMENSIONS, buildVentureScore } = await jiti.import(
  path.join(projectRoot, "src/features/ventures/venture-scoring.ts"),
);
const { buildVentureScoreProposal } = await jiti.import(
  path.join(projectRoot, "src/features/ventures/venture-score-proposal.ts"),
);

const DIMENSIONS = SCORE_DIMENSIONS.map((d) => d.key);
const ctx = { workspace: { id: "workspace_test" }, userId: "owner_1", storagePreference: "local" };
const NOW = "2026-08-05T12:00:00.000Z";

function proposal(proposalId = "prop_1") {
  const parsed = parseShadowEvidence({
    evidence: DIMENSIONS.map((dimension) => ({
      dimension,
      value: 7,
      rationale: "ok",
      source: { kind: "internal", ref: `venture:${dimension}` },
    })),
  });
  return buildVentureScoreProposal({
    proposalId,
    ventureId: "venture_1",
    workspaceId: ctx.workspace.id,
    proposedBy: "inventor",
    proposedAt: NOW,
    evidence: parsed.evidence,
  }).proposal;
}

const actual = () => buildVentureScore(Object.fromEntries(DIMENSIONS.map((d) => [d, 7])));

const found = (p = proposal()) => async () => ({
  status: "found",
  result: { proposal: p, loss: { rationalesTruncated: true }, recordedAt: NOW },
});

test("Shadow outcome hook (V7 Phase 1 step 4a)", async (t) => {
  await t.test("records the divergence and names the proposal it measured", async () => {
    const events = [];
    const result = await recordShadowOutcomeForVenture(ctx, "venture_1", actual(), {
      findProposal: found(proposal("prop_abc")),
      recordEvent: async (_ctx, event) => {
        events.push(event);
        return {};
      },
    });

    assert.equal(result.status, "recorded");
    assert.equal(result.proposalId, "prop_abc");
    assert.equal(
      events[0].metadata.proposalId,
      "prop_abc",
      "the outcome row must name WHICH proposal it measured",
    );
  });

  await t.test("a venture with no proposal is skipped, not failed", async () => {
    // Scoring a venture shadow mode never saw is normal, not an error.
    const result = await recordShadowOutcomeForVenture(ctx, "venture_1", actual(), {
      findProposal: async () => ({ status: "absent", reason: "not_found" }),
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "no_proposal");
  });

  await t.test("an unreadable proposal is distinguished from an absent one", async () => {
    // Collapsing the two would hide corrupt ledger data behind "nothing yet".
    const result = await recordShadowOutcomeForVenture(ctx, "venture_1", actual(), {
      findProposal: async () => ({ status: "absent", reason: "malformed_metadata" }),
    });

    assert.equal(result.reason, "proposal_unreadable");
  });

  await t.test("a failed write is reported as a write failure, not as no data", async () => {
    const result = await recordShadowOutcomeForVenture(ctx, "venture_1", actual(), {
      findProposal: found(),
      recordOutcome: async () => false,
    });

    assert.equal(result.reason, "write_failed");
  });

  await t.test("nothing thrown by a dependency escapes to the caller", async () => {
    // The caller is the owner's live scoring path: the score is the product,
    // the measurement is the byproduct, and the byproduct must never break it.
    for (const deps of [
      { findProposal: async () => { throw new Error("read down"); } },
      { findProposal: found(), recordOutcome: async () => { throw new Error("write down"); } },
    ]) {
      const result = await recordShadowOutcomeForVenture(ctx, "venture_1", actual(), deps);
      assert.equal(result.status, "skipped");
    }
  });

  await t.test("the hook imports no lifecycle mutator", async () => {
    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(__dirname, "shadow-outcome-hook.ts"), "utf8"),
    );
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    for (const mutator of ["scoreVenture", "promoteVenture", "archiveVenture", "killVenture"]) {
      assert.ok(!new RegExp(`\\b${mutator}\\s*\\(`).test(code), `${mutator} must not be callable here`);
    }
  });
});
