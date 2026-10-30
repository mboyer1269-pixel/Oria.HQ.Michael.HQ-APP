import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
test("profiles precede secondary registry panels while operational review remains mounted and visible", () => {
  const profiles = source.indexOf("<AgentCard key=");
  assert.ok(profiles > 0 && profiles < source.indexOf("<AgentCharterPanel"));
  assert.ok(source.indexOf('aria-label="Points de contrôle des agents"') < profiles);
  for (const target of ["agent-reviews", "agent-intents", "agent-run-health"]) {
    assert.match(source, new RegExp(`href="#${target}"`));
    assert.match(source, new RegExp(`id="${target}" tabIndex=\\{-1\\}`));
  }
  assert.match(source, /Lecture partielle/); assert.doesNotMatch(source, /Tout va bien|Aucun incident/);
  for (const component of ["AgentRunHealthPanel", "AgentReviewQueuePanel", "ExecutionIntentReviewPanel", "AgentAutonomyPolicyPanel"]) {
    assert.equal((source.match(new RegExp(`<${component}\\b`, "g")) ?? []).length, 1);
  }
  assert.doesNotMatch(source, /<details|<dialog/);
  assert.match(source, /Aucun agent n&apos;agit sans mandat explicite/);
  assert.match(source, /ces statuts|Ces statuts/);
  assert.match(source, /requireOwnerAccess\("\/hq\/agents"\)/);
});
