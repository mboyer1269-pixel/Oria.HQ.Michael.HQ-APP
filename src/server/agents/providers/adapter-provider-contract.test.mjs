#!/usr/bin/env node

// src/server/agents/providers/adapter-provider-contract.test.mjs
//
// Base corridor contract invariants (pure module, literal fixtures):
//   INV-C1: valid descriptor validates
//   INV-C2: wildcards (operations or skillIds) invalidate
//   INV-C3: allowed ∩ forbidden invalidates (forbidden wins)
//   INV-C4: value-shaped secretRef invalidates (refs are names, not values)
//   INV-C5: untrusted manifest + green-zone binding invalidates
//   INV-C6: unknown skillId is never eligible
//   INV-C7: the eligible arm can only hand off to Sentinelle (nextGate
//           literal) with ledgerRequired — no execute path exists

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

function binding(over = {}) {
  return {
    skillId: over.skillId ?? "task.create",
    operation: over.operation ?? "create_task",
    requiredExecutionZone: over.requiredExecutionZone ?? "yellow",
    requiredAutonomyLevel: over.requiredAutonomyLevel ?? 2,
    requiresWager: over.requiresWager ?? true,
    supportsDryRun: over.supportsDryRun ?? true,
    supportsIdempotencyKey: over.supportsIdempotencyKey ?? true,
  };
}

function descriptor(over = {}) {
  return {
    providerId: over.providerId ?? "adapter:test-tools",
    adapterKind: over.adapterKind ?? "tool_provider",
    displayName: over.displayName ?? "Test tools",
    skillBindings: over.skillBindings ?? [binding()],
    allowedOperations: over.allowedOperations ?? ["create_task"],
    forbiddenOperations: over.forbiddenOperations ?? ["delete_account"],
    rateLimit: over.rateLimit ?? { maxCallsPerMinute: 10 },
    secretRefs: over.secretRefs ?? [{ envName: "TEST_ADAPTER_TOKEN", purpose: "auth" }],
    failureMode: over.failureMode ?? "fail_closed",
    handoffMode: over.handoffMode ?? "ceo_review",
    provenance:
      over.provenance ?? {
        registeredAt: "2026-07-02T12:00:00.000Z",
        registeredBy: "ceo",
        manifestTrust: "pinned",
        manifestHash: "abc123",
      },
  };
}

test("Tool Universe Corridor — base adapter contract (pure)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(projectRoot, "src") },
  });
  const mod = await jiti.import(path.join(__dirname, "adapter-provider-contract.ts"));
  const { validateAdapterDescriptor, resolveAdapterInvocation } = mod;

  await t.test("INV-C1: a well-formed descriptor validates", () => {
    assert.deepEqual(validateAdapterDescriptor(descriptor()), { ok: true });
  });

  await t.test("INV-C2: wildcards invalidate", () => {
    const wildOp = validateAdapterDescriptor(
      descriptor({ allowedOperations: ["create_task", "admin*"] }),
    );
    assert.equal(wildOp.ok, false);

    const wildSkill = validateAdapterDescriptor(
      descriptor({ skillBindings: [binding({ skillId: "task.*" })] }),
    );
    assert.equal(wildSkill.ok, false);
  });

  await t.test("INV-C3: allowed ∩ forbidden invalidates", () => {
    const overlap = validateAdapterDescriptor(
      descriptor({
        allowedOperations: ["create_task", "delete_account"],
        forbiddenOperations: ["delete_account"],
      }),
    );
    assert.equal(overlap.ok, false);
    assert.match(overlap.violations.join(" "), /forbidden wins/);
  });

  await t.test("INV-C4: value-shaped secret refs invalidate", () => {
    for (const envName of ["token=sk-abc123", "lower_case", "X", "HAS SPACE"]) {
      const bad = validateAdapterDescriptor(
        descriptor({ secretRefs: [{ envName, purpose: "auth" }] }),
      );
      assert.equal(bad.ok, false, `envName "${envName}" should invalidate`);
    }
  });

  await t.test("INV-C5: untrusted manifest cannot claim green-zone bindings", () => {
    const untrustedGreen = validateAdapterDescriptor(
      descriptor({
        provenance: {
          registeredAt: "2026-07-02T12:00:00.000Z",
          registeredBy: "ceo",
          manifestTrust: "untrusted",
        },
        skillBindings: [binding({ requiredExecutionZone: "green" })],
      }),
    );
    assert.equal(untrustedGreen.ok, false);

    const untrustedYellow = validateAdapterDescriptor(
      descriptor({
        provenance: {
          registeredAt: "2026-07-02T12:00:00.000Z",
          registeredBy: "ceo",
          manifestTrust: "untrusted",
        },
        skillBindings: [binding({ requiredExecutionZone: "yellow" })],
      }),
    );
    assert.equal(untrustedYellow.ok, true, "untrusted may still bind approval-gated zones");
  });

  await t.test("INV-C6: unknown skillId is never eligible", () => {
    const res = resolveAdapterInvocation(descriptor(), "task.delete_everything");
    assert.equal(res.eligible, false);
    assert.match(res.reason, /unknown is never eligible/i);
  });

  await t.test("INV-C7: eligible arm hands off to Sentinelle with mandatory ledger", () => {
    const res = resolveAdapterInvocation(descriptor(), "task.create");
    assert.equal(res.eligible, true);
    assert.equal(res.nextGate, "sentinelle");
    assert.equal(res.ledgerRequired, true);
    assert.equal(res.binding.skillId, "task.create");
  });

  await t.test("invalid descriptor makes every invocation ineligible", () => {
    const res = resolveAdapterInvocation(
      descriptor({ providerId: "not-an-adapter-id" }),
      "task.create",
    );
    assert.equal(res.eligible, false);
    assert.match(res.reason, /Descriptor invalid/);
  });
});
