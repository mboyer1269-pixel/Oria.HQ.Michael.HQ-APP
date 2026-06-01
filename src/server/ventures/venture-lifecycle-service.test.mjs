#!/usr/bin/env node

// src/server/ventures/venture-lifecycle-service.test.mjs
//
// PR150 — controlled lifecycle management (edit / archive / kill). Tests the
// testable service core (auth lives in the action). Mirrors the venture-save
// test harness; forces the local-fallback repository path.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const FORBIDDEN_HISTORICAL_NAMES = [
  "MCL",
  "Suivia",
  "NOORKI",
  "Dad School",
  "DADZCO",
  "MUMZCO",
  "APPAREL",
];

// Permanent delete is intentionally absent (PR150/PR151). Promotion IS allowed
// from PR151 (CEO-controlled advancement) — it is NOT in this forbidden list.
const FORBIDDEN_EXPORTS = [
  "deleteVenture",
  "hardDeleteVenture",
  "removeVenture",
  "purgeVenture",
];

test("Venture lifecycle service (PR150)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const serviceMod = await jiti.import(path.join(__dirname, "venture-lifecycle-service.ts"));
  const { updateVentureDetails, archiveVenture, killVenture, promoteVenture, scoreVenture } =
    serviceMod;

  const promotionMod = await jiti.import(
    path.join(projectRoot, "src/features/ventures/venture-promotion.ts"),
  );
  const { getPromotableTargets, advancementDecisionType } = promotionMod;

  const repoMod = await jiti.import(path.join(__dirname, "venture-repository.ts"));
  const { createVenture, getVentureById, __clearVenturesForTests } = repoMod;

  const draftMod = await jiti.import(path.join(projectRoot, "src/features/ventures/draft.ts"));
  const { createLocalDraftVentureCard } = draftMod;

  let counter = 0;
  function buildCard(overrides = {}) {
    counter += 1;
    return createLocalDraftVentureCard({
      name: "Neutral Lifecycle Sample",
      description: "Carte de test neutre pour le cycle de vie.",
      targetCustomer: "Équipes ops cherchant une automatisation simple.",
      problem: "Tâches répétitives sans outil adapté.",
      offer: "Workflow léger qui automatise une étape.",
      primaryChannel: "Outreach direct après approbation CEO.",
      hypothesis: "2 équipes paieront pour gagner du temps.",
      validationWindowDays: 30,
      budgetCapCents: 0,
      firstSuccessMetric: "2 entretiens qualifiés réalisés",
      firstKillMetric: "qualified_interviews",
      firstKillThreshold: "< 2 en 30 jours",
      id: `venture-local-draft-lc-${counter}`,
      now: "2026-05-31T00:00:00.000Z",
      ...overrides,
    });
  }

  async function seed(workspaceId, overrides) {
    const card = buildCard(overrides);
    if (overrides?.status) card.status = overrides.status;
    if (overrides?.score) card.score = overrides.score;
    if (overrides?.decisions) card.decisions = overrides.decisions;
    await createVenture(workspaceId, card);
    return card;
  }

  function validScores(overrides = {}) {
    return {
      revenuePotential: 8,
      speedToFirstDollar: 7,
      costToValidate: 2,
      automationPotential: 8,
      ownerInvolvementRequired: 3,
      marketPain: 8,
      differentiation: 7,
      executionDifficulty: 3,
      risk: 3,
      grossMarginPotential: 8,
      strategicFit: 8,
      ...overrides,
    };
  }

  t.beforeEach(() => __clearVenturesForTests());
  t.afterEach(() => __clearVenturesForTests());

  await t.test("edit updates only allowed fields, immutables preserved", async () => {
    const card = await seed("ws1");
    const result = await updateVentureDetails("ws1", {
      ventureId: card.id,
      fields: { name: "Nouveau nom", targetCustomer: "Nouveau client cible" },
      now: "2026-06-02T00:00:00.000Z",
    });

    assert.equal(result.status, "saved");
    assert.equal(result.card.name, "Nouveau nom");
    assert.equal(result.card.targetCustomer, "Nouveau client cible");
    // Immutables untouched.
    assert.equal(result.card.id, card.id);
    assert.equal(result.card.source, card.source);
    assert.equal(result.card.createdAt, card.createdAt);
    assert.equal(result.card.status, "candidate");
    assert.equal(result.card.updatedAt, "2026-06-02T00:00:00.000Z");
    // Edit never appends a decision.
    assert.equal(result.card.decisions.length, 0);
  });

  await t.test("edit with no effective change returns no_changes (not persisted as new)", async () => {
    const card = await seed("ws1");
    const result = await updateVentureDetails("ws1", {
      ventureId: card.id,
      fields: { name: card.name },
    });
    assert.equal(result.status, "error");
    assert.equal(result.code, "no_changes");
  });

  await t.test("archive sets status archived and appends an audit decision", async () => {
    const card = await seed("ws1");
    const result = await archiveVenture("ws1", {
      ventureId: card.id,
      reason: "Plus prioritaire ce trimestre.",
      now: "2026-06-02T00:00:00.000Z",
    });

    assert.equal(result.status, "saved");
    assert.equal(result.card.status, "archived");
    assert.equal(result.card.decisions.length, 1);
    const decision = result.card.decisions[0];
    assert.equal(decision.type, "archive");
    assert.equal(decision.summary, "Plus prioritaire ce trimestre.");
    assert.equal(decision.decidedBy, "ceo");
    assert.equal(decision.humanOnTheLoop, true);
    assert.equal(decision.noExecutionAuthorized, true);

    // Persisted (loadable back as archived).
    const reloaded = await getVentureById("ws1", card.id);
    assert.equal(reloaded.status, "archived");
  });

  await t.test("kill sets status killed and appends an audit decision", async () => {
    const card = await seed("ws1");
    const result = await killVenture("ws1", {
      ventureId: card.id,
      reason: "Hypothèse invalidée, aucun signal d'achat.",
      now: "2026-06-02T00:00:00.000Z",
    });

    assert.equal(result.status, "saved");
    assert.equal(result.card.status, "killed");
    assert.equal(result.card.decisions.length, 1);
    const decision = result.card.decisions[0];
    assert.equal(decision.type, "kill");
    assert.equal(decision.decidedBy, "ceo");
    assert.equal(decision.humanOnTheLoop, true);
    assert.equal(decision.noExecutionAuthorized, true);
  });

  await t.test("archive requires a non-empty reason", async () => {
    const card = await seed("ws1");
    const result = await archiveVenture("ws1", { ventureId: card.id, reason: "   " });
    assert.equal(result.status, "error");
    assert.equal(result.code, "invalid_reason");
    // Not mutated.
    const reloaded = await getVentureById("ws1", card.id);
    assert.equal(reloaded.status, "candidate");
    assert.equal(reloaded.decisions.length, 0);
  });

  await t.test("kill requires a non-empty reason", async () => {
    const card = await seed("ws1");
    const result = await killVenture("ws1", { ventureId: card.id, reason: "" });
    assert.equal(result.status, "error");
    assert.equal(result.code, "invalid_reason");
  });

  await t.test("editing a terminal (archived/killed) venture is refused", async () => {
    const card = await seed("ws1");
    await killVenture("ws1", { ventureId: card.id, reason: "Stop." });
    const result = await updateVentureDetails("ws1", {
      ventureId: card.id,
      fields: { name: "Tentative d'édition" },
    });
    assert.equal(result.status, "error");
    assert.equal(result.code, "not_editable");
  });

  await t.test("workspace isolation: cannot archive/kill/edit across workspaces", async () => {
    const card = await seed("ws1");
    assert.equal((await archiveVenture("ws2", { ventureId: card.id, reason: "x" })).code, "not_found");
    assert.equal((await killVenture("ws2", { ventureId: card.id, reason: "x" })).code, "not_found");
    assert.equal(
      (await updateVentureDetails("ws2", { ventureId: card.id, fields: { name: "y" } })).code,
      "not_found",
    );
    // The ws1 venture is untouched.
    const reloaded = await getVentureById("ws1", card.id);
    assert.equal(reloaded.status, "candidate");
    assert.equal(reloaded.decisions.length, 0);
  });

  await t.test("unknown venture returns a safe not_found error", async () => {
    assert.equal(
      (await archiveVenture("ws1", { ventureId: "nope", reason: "x" })).code,
      "not_found",
    );
    assert.equal(
      (await updateVentureDetails("ws1", { ventureId: "nope", fields: { name: "x" } })).code,
      "not_found",
    );
  });

  await t.test("no permanent-delete export exists (delete stays out of scope)", () => {
    for (const name of FORBIDDEN_EXPORTS) {
      assert.equal(serviceMod[name], undefined, `lifecycle service must not export "${name}"`);
      assert.equal(repoMod[name], undefined, `repository must not export "${name}"`);
    }
  });

  await t.test("getPromotableTargets returns only legal forward steps", () => {
    assert.deepEqual(getPromotableTargets("candidate"), ["scored"]);
    assert.deepEqual(getPromotableTargets("operating"), ["autonomous", "scaling"]);
    assert.deepEqual(getPromotableTargets("archived"), []);
    assert.deepEqual(getPromotableTargets("killed"), []);
  });

  await t.test("advancementDecisionType maps targets to audit decision types", () => {
    assert.equal(advancementDecisionType("scored"), "promote");
    assert.equal(advancementDecisionType("autonomous"), "increase_autonomy");
    assert.equal(advancementDecisionType("scaling"), "scale");
  });

  await t.test("promote advances one legal step and records an audit decision", async () => {
    const card = await seed("ws1");
    const result = await promoteVenture("ws1", {
      ventureId: card.id,
      targetStatus: "scored",
      now: "2026-06-02T00:00:00.000Z",
    });
    assert.equal(result.status, "saved");
    assert.equal(result.card.status, "scored");
    assert.equal(result.card.decisions.length, 1);
    const decision = result.card.decisions[0];
    assert.equal(decision.type, "promote");
    assert.equal(decision.decidedBy, "ceo");
    assert.equal(decision.humanOnTheLoop, true);
    assert.equal(decision.noExecutionAuthorized, true);
  });

  await t.test("promote uses the provided note as the decision summary", async () => {
    const card = await seed("ws1");
    const result = await promoteVenture("ws1", {
      ventureId: card.id,
      targetStatus: "scored",
      note: "Signal d'intérêt clair sur 3 entretiens.",
    });
    assert.equal(result.card.decisions[0].summary, "Signal d'intérêt clair sur 3 entretiens.");
  });

  await t.test("promote rejects an illegal (non-adjacent) transition", async () => {
    const card = await seed("ws1");
    const result = await promoteVenture("ws1", { ventureId: card.id, targetStatus: "operating" });
    assert.equal(result.status, "error");
    assert.equal(result.code, "illegal_transition");
    // Unchanged.
    assert.equal((await getVentureById("ws1", card.id)).status, "candidate");
  });

  await t.test("promote refuses a terminal venture", async () => {
    const card = await seed("ws1");
    await killVenture("ws1", { ventureId: card.id, reason: "Stop." });
    const result = await promoteVenture("ws1", { ventureId: card.id, targetStatus: "scored" });
    assert.equal(result.status, "error");
    assert.equal(result.code, "illegal_transition");
  });

  await t.test("promote can walk the full ladder; scaling records a scale decision", async () => {
    const card = await seed("ws1");
    const ladder = [
      "scored",
      "shortlisted",
      "approved_for_validation",
      "validating",
      "operating",
      "scaling",
    ];
    let last;
    for (const target of ladder) {
      last = await promoteVenture("ws1", { ventureId: card.id, targetStatus: target });
      assert.equal(last.status, "saved", `step to ${target} should persist`);
      assert.equal(last.card.status, target);
    }
    assert.equal(last.card.decisions.length, ladder.length);
    assert.equal(last.card.decisions.at(-1).type, "scale");
  });

  await t.test("promote is workspace-isolated", async () => {
    const card = await seed("ws1");
    assert.equal(
      (await promoteVenture("ws2", { ventureId: card.id, targetStatus: "scored" })).code,
      "not_found",
    );
  });

  await t.test("scoreVenture saves score, advances candidate to scored, and appends audit-only decision", async () => {
    const card = await seed("ws1");
    const result = await scoreVenture("ws1", {
      ventureId: card.id,
      scores: validScores(),
      now: "2026-06-02T00:00:00.000Z",
    });

    assert.equal(result.status, "saved");
    assert.equal(result.card.status, "scored");
    assert.equal(result.card.score.overallScore, 75);
    assert.equal(result.card.score.recommendation, "go");
    assert.equal(result.card.updatedAt, "2026-06-02T00:00:00.000Z");
    assert.equal(result.card.decisions.length, 1);

    const decision = result.card.decisions[0];
    assert.equal(decision.type, "score");
    assert.equal(decision.decidedBy, "ceo");
    assert.equal(decision.humanOnTheLoop, true);
    assert.equal(decision.noExecutionAuthorized, true);
    assert.match(decision.summary, /advanced/);

    const reloaded = await getVentureById("ws1", card.id);
    assert.equal(reloaded.status, "scored");
    assert.equal(reloaded.score.overallScore, 75);
  });

  await t.test("scoreVenture accepts CEO recommendation override without changing overall score", async () => {
    const card = await seed("ws1");
    const result = await scoreVenture("ws1", {
      ventureId: card.id,
      scores: validScores(),
      recommendation: "hold",
    });

    assert.equal(result.status, "saved");
    assert.equal(result.card.score.overallScore, 75);
    assert.equal(result.card.score.recommendation, "hold");
  });

  await t.test("scoreVenture rejects invalid sub-scores and leaves the venture unchanged", async () => {
    const card = await seed("ws1");
    const result = await scoreVenture("ws1", {
      ventureId: card.id,
      scores: validScores({ risk: 11 }),
    });

    assert.equal(result.status, "error");
    assert.equal(result.code, "invalid_score");
    const reloaded = await getVentureById("ws1", card.id);
    assert.equal(reloaded.status, "candidate");
    assert.equal(reloaded.score, undefined);
    assert.equal(reloaded.decisions.length, 0);
  });

  await t.test("scoreVenture re-scores non-candidate ventures without auto-advancing", async () => {
    const card = await seed("ws1", { status: "shortlisted" });
    const result = await scoreVenture("ws1", {
      ventureId: card.id,
      scores: validScores({ risk: 9 }),
    });

    assert.equal(result.status, "saved");
    assert.equal(result.card.status, "shortlisted");
    assert.equal(result.card.score.overallScore, 70);
    assert.equal(result.card.decisions.length, 1);
    assert.equal(result.card.decisions[0].type, "score");
    assert.match(result.card.decisions[0].summary, /status remains/);
  });

  await t.test("scoreVenture refuses terminal ventures", async () => {
    const archived = await seed("ws1", { status: "archived" });
    const killed = await seed("ws1", { status: "killed" });

    assert.equal(
      (await scoreVenture("ws1", { ventureId: archived.id, scores: validScores() })).code,
      "not_editable",
    );
    assert.equal(
      (await scoreVenture("ws1", { ventureId: killed.id, scores: validScores() })).code,
      "not_editable",
    );
  });

  await t.test("scoreVenture is workspace-isolated", async () => {
    const card = await seed("ws1");
    assert.equal(
      (await scoreVenture("ws2", { ventureId: card.id, scores: validScores() })).code,
      "not_found",
    );
    const reloaded = await getVentureById("ws1", card.id);
    assert.equal(reloaded.status, "candidate");
    assert.equal(reloaded.score, undefined);
  });

  await t.test("no historical venture names in lifecycle output", async () => {
    const card = await seed("ws1");
    const result = await archiveVenture("ws1", { ventureId: card.id, reason: "Neutre." });
    const blob = JSON.stringify(result.card);
    for (const forbidden of FORBIDDEN_HISTORICAL_NAMES) {
      assert.equal(blob.includes(forbidden), false, `output must not reference "${forbidden}"`);
    }
  });
});
