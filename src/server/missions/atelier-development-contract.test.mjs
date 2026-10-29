import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs") } });
const C = await jiti.import("./atelier-development-contract.ts");
const { createDevelopmentService } = await jiti.import("./development-mission.ts");
const context = { workspaceId: "ws-a", modeId: "hq", actorId: "owner-a" };
let mission;
await createDevelopmentService({ enabled: () => true, store: () => ({ save: async value => (mission = value), load: async () => null }) }).create({
  requestId: "12345678-1234-4234-8234-123456789abc", title: "One component", objective: "Prepare its specification", scope: "Internal draft only", acceptanceCriteria: "Clear tests",
}, context);
mission.updatedAt = "2026-10-28T20:00:00.000Z";
const request = { missionId: mission.id, repository: { relativePath: "project/app", baseSha: "a".repeat(40) },
  selection: { runtimeId: "codex", modelId: "gpt-test", catalogRevision: "fixture-1" }, timeoutMs: 60_000 };

test("binding is deterministic, scoped, and only requests a non-authoritative instruction profile", () => {
  const before = structuredClone(mission);
  const b = C.buildAtelierDevelopmentBinding(mission, context, request);
  assert.deepEqual(b, C.buildAtelierDevelopmentBinding(mission, context, request));
  assert.deepEqual(mission, before);
  assert.deepEqual(b.specialist, { agentId: "builder", skillId: "spec.draft", purpose: "instruction_profile_only" });
  assert.equal(b.limits.paidApiAllowed, false); assert.equal(b.limits.externalEffectsAllowed, false);
  assert.equal(b.limits.missionCostBudgetCents, null); assert.equal(b.output, "SPEC.md");
  assert.match(b.bindingHash, /^[a-f0-9]{64}$/);
});

test("binding refuses forged development metadata, changed criteria, assignment and authority", () => {
  for (const change of [m => { m.objective = "changed"; }, m => { m.input.development.scope = "changed"; },
    m => { m.input.development.createdBy = "other"; }, m => { m.expectedOutput = "deploy"; },
    m => { m.assignedAgentId = "builder"; }, m => { m.autonomyLevel = 2; },
    m => { m.requiresApproval = false; }, m => { m.status = "running"; }, m => { m.costBudgetCents = -1; }]) {
    const changed = structuredClone(mission); change(changed);
    assert.equal(C.buildAtelierDevelopmentBinding(changed, context, request), null);
  }
  for (const key of ["workspaceId", "modeId", "actorId"])
    assert.equal(C.buildAtelierDevelopmentBinding(mission, { ...context, [key]: "other" }, request), null);
});

test("configuration and budget changes change the hash; invalid paths/limits/extra authority are refused", () => {
  const b = C.buildAtelierDevelopmentBinding(mission, context, request);
  for (const change of [r => { r.selection.modelId = "other"; }, r => { r.selection.catalogRevision = "fixture-2"; },
    r => { r.repository.baseSha = "b".repeat(40); }, r => { r.timeoutMs = 120_000; }]) {
    const changed = structuredClone(request); change(changed);
    assert.notEqual(C.buildAtelierDevelopmentBinding(mission, context, changed).bindingHash, b.bindingHash);
  }
  assert.notEqual(C.buildAtelierDevelopmentBinding({ ...mission, costBudgetCents: 0 }, context, request).bindingHash, b.bindingHash);
  for (const relativePath of ["../escape", "/absolute", "a//b", "a/./b", "a\\b", "a\u0000b", "C:/absolute", " leading"])
    assert.equal(C.atelierDevelopmentRequestSchema.safeParse({ ...request, repository: { ...request.repository, relativePath } }).success, false);
  for (const timeoutMs of [0, 900_001, 1.5, Infinity])
    assert.equal(C.atelierDevelopmentRequestSchema.safeParse({ ...request, timeoutMs }).success, false);
  assert.equal(C.atelierDevelopmentRequestSchema.safeParse({ ...request, approved: true }).success, false);
});

test("claim parsing refuses hash tampering and execution states; reread checks the current source", () => {
  const binding = C.buildAtelierDevelopmentBinding(mission, context, request);
  const claim = { version: 1, state: "reserved", runId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", reservedAt: "2026-10-28T20:00:01.000Z", binding, executionRequested: false };
  assert.ok(C.readAtelierDevelopmentClaim(claim));
  assert.equal(C.readAtelierDevelopmentClaim({ ...claim, executionRequested: true }), null);
  assert.equal(C.readAtelierDevelopmentClaim({ ...claim, state: "running" }), null);
  assert.equal(C.readAtelierDevelopmentClaim({ ...claim, binding: { ...binding, bindingHash: "0".repeat(64) } }), null);
  assert.equal(C.claimMatchesDevelopmentMission(claim, { ...mission, updatedAt: "2026-10-28T20:00:02.000Z" }, context), true);
  assert.equal(C.claimMatchesDevelopmentMission(claim, { ...mission, costBudgetCents: 1 }, context), false);
});
