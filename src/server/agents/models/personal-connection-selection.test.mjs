import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { moduleCache: false, virtualModules: { "server-only": {} },
  alias: { "@": new URL("../../..", import.meta.url).pathname } });
const { checkPersonalConnectionSelection: check, personalConnectionSelectionSchema: schema } =
  await jiti.import("./personal-connection-selection.ts");

const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const selection = { connectionRef: uuid(1), ownerActorRef: uuid(2), workspaceRef: "ws-1",
  hostRef: uuid(3), accountRef: uuid(4), providerId: "claude-code-cli",
  adapterId: "claude-code-cli-subscription", modelId: "claude-sonnet-4-6", revision: 1 };
const nowMs = Date.parse("2026-10-22T12:00:00Z");
function fixture() {
  return { scope: { ownerActorRef: uuid(2), workspaceRef: "ws-1" }, approved: { ...selection },
    current: { selection: { ...selection }, state: "paired" },
    identity: { accountRef: uuid(4), workspaceRef: "ws-1", provider: "claude" },
    observation: { selection: { ...selection }, recordedBy: uuid(9),
      observedAtIso: "2026-10-22T11:59:59Z", capability: "inference_observed" }, nowMs, maxEvidenceAgeMs: 1000 };
}
const rejected = (input, reason) => assert.deepEqual(check(input), { status: "rejected", reason, externalEffectAllowed: false });

test("consistent snapshots never authorize an external effect; observer is not owner", () => {
  assert.deepEqual(check(fixture()), { status: "consistent", externalEffectAllowed: false });
});
test("every selected field is rechecked against the approved snapshot", () => {
  const alternatives = { connectionRef: uuid(11), ownerActorRef: uuid(12), workspaceRef: "ws-2",
    hostRef: uuid(13), accountRef: uuid(14), providerId: "codex-acp-cli", adapterId: "other",
    modelId: "claude-opus-4-6", revision: 2 };
  for (const [field, value] of Object.entries(alternatives)) {
    const input = fixture(); input.current.selection[field] = value;
    rejected(input, ["providerId", "adapterId"].includes(field) ? "invalid_input"
      : ["ownerActorRef", "workspaceRef"].includes(field) ? "scope_mismatch" : "selection_changed");
  }
});
test("evidence from another connection, host, account, model or revision is never reused", () => {
  for (const [field, value] of Object.entries({ connectionRef: uuid(11), hostRef: uuid(13), accountRef: uuid(14),
    modelId: "claude-opus-4-6", revision: 2 })) {
    const input = fixture(); input.observation.selection[field] = value;
    rejected(input, "evidence_mismatch");
  }
});
test("two connections for one provider validate independently without sharing evidence", () => {
  const first = fixture(), second = fixture();
  for (const s of [second.approved, second.current.selection, second.observation.selection]) {
    s.connectionRef = uuid(21); s.hostRef = uuid(23); s.accountRef = uuid(24);
  }
  second.identity.accountRef = uuid(24);
  assert.equal(check(first).status, "consistent"); assert.equal(check(second).status, "consistent");
  second.observation = first.observation;
  rejected(second, "evidence_mismatch");
});
test("revocation and pending pairing close even a previously consistent selection", () => {
  for (const state of ["revoked", "pending"]) {
    const input = fixture(); input.current.state = state;
    rejected(input, state === "revoked" ? "revoked" : "not_paired");
  }
});
test("canonical identity reference must match workspace, account and provider", () => {
  for (const [field, value] of Object.entries({ accountRef: uuid(44), workspaceRef: "ws-2", provider: "codex" })) {
    const input = fixture(); input.identity[field] = value;
    rejected(input, field === "provider" ? "invalid_input" : "identity_mismatch");
  }
});
test("recordedBy cannot confer ownership of foreign observations or approve a selection", () => {
  const input = fixture(); input.observation.recordedBy = input.scope.ownerActorRef;
  input.observation.selection.ownerActorRef = uuid(20);
  rejected(input, "scope_mismatch");
  const foreign = fixture(); foreign.scope.ownerActorRef = uuid(9);
  rejected(foreign, "scope_mismatch");
});
test("login recognition does not qualify inference", () => {
  const input = fixture(); input.observation.capability = "login_recognized";
  rejected(input, "inference_not_observed");
});
test("freshness bounds include exact boundary but reject future, invalid and stale times", () => {
  for (const delta of [-1, 1001]) {
    const input = fixture(); input.observation.observedAtIso = new Date(nowMs - delta).toISOString();
    rejected(input, "stale_evidence");
  }
  const input = fixture(); input.maxEvidenceAgeMs = 0; rejected(input, "stale_evidence");
  input.observation.observedAtIso = new Date(nowMs).toISOString(); assert.equal(check(input).status, "consistent");
  input.observation.observedAtIso = "invalid"; rejected(input, "invalid_input");
  for (const number of [NaN, Infinity, -1, 3_600_001]) {
    const invalid = fixture(); invalid.maxEvidenceAgeMs = number; rejected(invalid, "invalid_input");
  }
  for (const number of [NaN, Infinity]) { const invalid = fixture(); invalid.nowMs = number; rejected(invalid, "invalid_input"); }
});
test("strict metadata refuses unknown credential fields, aliases and malformed revisions", () => {
  for (const extra of [{ token: "fixture-only" }, { executablePath: "/fixture/client" }, { email: "fixture@example.test" }]) {
    assert.equal(schema.safeParse({ ...selection, ...extra }).success, false);
  }
  for (const modelId of ["default", "latest", "sonnet", "claude-latest-4"]) {
    assert.equal(schema.safeParse({ ...selection, modelId }).success, false);
  }
  for (const revision of [0, -1, 1.5, NaN, Infinity]) assert.equal(schema.safeParse({ ...selection, revision }).success, false);
  rejected(null, "invalid_input");
});
