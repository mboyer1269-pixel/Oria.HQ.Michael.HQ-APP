import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { missionDossierSummary } = await createJiti(import.meta.url).import("./mission-dossier.ts");
const mission = { status: "completed", result: { summary: "Tests annoncés réussis" } };

test("reported completion stays a declaration requiring verification", () => {
  const result = missionDossierSummary(mission);
  assert.equal(result.status, "Terminée déclarée");
  assert.equal(result.reportedResult, "Tests annoncés réussis");
  assert.match(result.nextStep, /Vérifier/);
});
test("an unknown budget is never shown as zero, but explicit zero is retained", () => {
  for (const value of [undefined, null, NaN, Infinity, -1, "100"]) {
    assert.equal(missionDossierSummary({ ...mission, costBudgetCents: value }).budget, "Non défini");
  }
  assert.equal(missionDossierSummary({ ...mission, costBudgetCents: 0 }).budget, "0.00 $");
});
test("malformed or empty summaries do not fabricate a result", () => {
  for (const value of [undefined, {}, 0, "", "  "]) {
    assert.equal(missionDossierSummary({ ...mission, result: { summary: value } }).reportedResult, null);
  }
});

test("owners use canonical names while missing and unknown agents stay understandable", () => {
  assert.equal(missionDossierSummary({ ...mission, assignedAgentId: "agent_hermes" }).owner, "Relay");
  assert.equal(missionDossierSummary({ ...mission, assignedAgentId: "joris" }).owner, "Joris");
  assert.equal(missionDossierSummary({ ...mission, assignedAgentId: "agent_opaque_123" }).owner, "Agent à identifier");
  assert.equal(missionDossierSummary({ ...mission, assignedAgentId: "" }).owner, "Non attribué");
});
