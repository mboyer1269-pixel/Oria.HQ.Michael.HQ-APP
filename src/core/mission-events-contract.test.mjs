#!/usr/bin/env node
// Pure tests for src/core/mission-events-contract.ts. No network, no DB.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(projectRoot, "src") } });
const C = await jiti.import(path.join(projectRoot, "src/core/mission-events-contract.ts"));

const H = (c) => c.repeat(64);
const FUT = "2099-01-01T00:00:00Z";
const NOW = new Date("2026-10-25T12:00:00Z");
let seq = 0;
const base = (o = {}) => ({ workspaceId: "ws", missionId: "m1", seq: ++seq, intentKey: `k${seq}`, eventType: "mission_queued", state: "queued", traceId: "t", payloadHash: null, actor: "u", channel: "screen", capability: null, grantId: null, expiresAt: null, costMicroUsd: null, costSource: null, provider: null, model: null, occurredAt: "2026-10-25T11:00:00Z", ...o });
const reset = () => { seq = 0; };
const grant = (cap, g, h, o = {}) => base({ eventType: "approval_granted", state: "approved", capability: cap, grantId: g, payloadHash: h, expiresAt: FUT, ...o });

test("schema: valid event parses; cost/source consistency; approval binding; voice rule", () => {
  reset();
  assert.ok(C.missionEventSchema.safeParse(base()).success);
  assert.ok(!C.missionEventSchema.safeParse(base({ costMicroUsd: 5 })).success);
  assert.ok(!C.missionEventSchema.safeParse(base({ costSource: "measured" })).success);
  assert.ok(C.missionEventSchema.safeParse(base({ eventType: "tool_call_completed", costMicroUsd: 5, costSource: "measured", provider: "anthropic", model: "claude-sonnet-4-5" })).success);
  assert.ok(!C.missionEventSchema.safeParse(base({ eventType: "approval_granted", capability: "merge:pr", grantId: "g" })).success);
  assert.ok(!C.missionEventSchema.safeParse(grant("tool:x", "g", H("a"), { expiresAt: null })).success);
  for (const cap of ["merge:pr", "payment", "external_send:email", "external_send.email", "delete:file", "harness_change", "unsandboxed:shell", "connector:calendar"])
    assert.ok(!C.missionEventSchema.safeParse(grant(cap, "g", H("a"), { channel: "voice" })).success, cap);
  assert.ok(C.missionEventSchema.safeParse(grant("repo.read", "g", H("a"), { channel: "voice" })).success);
  for (const cap of ["delete_repo", "payments:card"]) assert.ok(!C.missionEventSchema.safeParse(grant(cap, "g", H("a"))).success, cap);
  for (const channel of ["agent", "system"]) assert.ok(!C.missionEventSchema.safeParse(grant("tool:x", "g", H("a"), { channel })).success, channel);
  assert.ok(!C.missionEventSchema.safeParse({ ...base(), extra: 1 }).success);
});

test("allowlist is closed: unknown capabilities require approval, legacy approvals map to capabilities", () => {
  assert.equal(C.requiresApproval("test.run"), false);
  for (const cap of ["connector:gmail", "secret:stripe", "egress:api.x.com", "tool:new", "harness_change", "unsandboxed", "anything"]) assert.equal(C.requiresApproval(cap), true, cap);
  assert.equal(C.LEGACY_APPROVAL_CAPABILITIES.approveHarnessChange, "harness_change");
  assert.equal(C.LEGACY_APPROVAL_CAPABILITIES.approveUnsandboxed, "unsandboxed");
});

test("projection: state follows last event, terminal is sticky, costs split by source", () => {
  reset();
  const p = C.projectMission([base(), base({ eventType: "mission_started", state: "running" }),
    base({ eventType: "tool_call_completed", state: "running", costMicroUsd: 1000, costSource: "measured" }),
    base({ eventType: "run_cost_recorded", state: "running", costMicroUsd: 250, costSource: "estimated" }),
    base({ eventType: "mission_succeeded", state: "succeeded" }), base({ eventType: "step_started", state: "running" })], NOW);
  assert.equal(p.state, "succeeded");
  assert.deepEqual(p.costMicroUsd, { measured: 1000, estimated: 250 });
  assert.equal(p.lastSeq, 6);
  assert.deepEqual(p.errors, []);
});

test("unlisted capability -> waiting_approval; grant usable once for same payload; stale after hash change", () => {
  reset();
  const h = [base(), base({ eventType: "approval_requested", state: "waiting_approval", capability: "connector:gmail", grantId: "g1", payloadHash: H("a"), expiresAt: FUT })];
  let p = C.projectMission(h, NOW);
  assert.equal(p.state, "waiting_approval");
  assert.deepEqual(C.authorizeCapability(p, "connector:gmail", H("a")), { ok: false, nextState: "waiting_approval", reason: "capability not in allowlist; human grant required" });
  assert.deepEqual(C.authorizeCapability(p, "test.run", H("a")), { ok: true, grantId: null });
  h.push(grant("connector:gmail", "g1", H("a")));
  p = C.projectMission(h, NOW);
  assert.deepEqual(C.authorizeCapability(p, "connector:gmail", H("a")), { ok: true, grantId: "g1" });
  assert.equal(C.authorizeCapability(p, "connector:gmail", H("b")).ok, false);
  h.push(base({ eventType: "approval_consumed", state: "running", capability: "connector:gmail", grantId: "g1", payloadHash: H("a") }));
  p = C.projectMission(h, NOW);
  assert.equal(p.grants[0].consumed, true);
  assert.equal(C.authorizeCapability(p, "connector:gmail", H("a")).reason, "grant already used (single-use)");
  // second consumption is reported as an error
  h.push(base({ eventType: "approval_consumed", state: "running", capability: "connector:gmail", grantId: "g1", payloadHash: H("a") }));
  assert.match(C.projectMission(h, NOW).errors.join(), /consumed twice/);

  reset();
  const s = [base(), grant("unsandboxed", "g2", H("a")), base({ eventType: "payload_changed", state: "approved", payloadHash: H("c") })];
  p = C.projectMission(s, NOW);
  assert.equal(p.state, "approval_stale");
  assert.equal(p.grants[0].stale, true);
  assert.equal(C.authorizeCapability(p, "unsandboxed", H("a")).nextState, "approval_stale");
});

test("expired grant is not usable; seq gaps are reported", () => {
  reset();
  const p = C.projectMission([base(), grant("harness_change", "g3", H("a"), { expiresAt: "2026-10-25T11:30:00Z" })], NOW);
  assert.equal(p.grants[0].expired, true);
  assert.equal(C.authorizeCapability(p, "harness_change", H("a")).ok, false);
  reset();
  const a = base(); seq++; const b = base();
  assert.match(C.projectMission([a, b], NOW).errors.join(), /seq gap/);
});
