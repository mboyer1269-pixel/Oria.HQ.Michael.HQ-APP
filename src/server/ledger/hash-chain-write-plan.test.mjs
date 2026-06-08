/**
 * hash-chain-write-plan.test.mjs
 *
 * The dormant write-contract: planChainWrite() is a no-op (returns null) while
 * the flag is OFF, and when ON it produces chain columns that form a chain the
 * verifier accepts. It is never wired into the live write path.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const { planChainWrite } = await import("./hash-chain-write-plan.ts");
const { verifyChain } = await import("./hash-chain-verifier.ts");

const HMAC = "test-only-hmac-key-do-not-use-in-production";

function rawEntry(id, summary) {
  return {
    id,
    workspace_id: "ws-1",
    user_id: "u-1",
    agent_id: null,
    skill_id: null,
    mission_id: null,
    action_type: "test.act",
    event_type: null,
    summary,
    autonomy_level: 0,
    requires_confirmation: false,
    payload: {},
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

test("OFF (explicit) returns null — no chain columns, current behavior", () => {
  assert.equal(
    planChainWrite({ fields: rawEntry("a", "x"), tail: null, enabled: false }),
    null,
  );
});

test("OFF by default (no env) returns null", () => {
  assert.equal(planChainWrite({ fields: rawEntry("a", "x"), tail: null }), null);
});

test("ON without hmacKey throws (fail-closed)", () => {
  assert.throws(
    () => planChainWrite({ fields: rawEntry("a", "x"), tail: null, enabled: true }),
    /hmacKey is required/,
  );
});

test("ON genesis seals with null prev_hash and canonical_version 1", () => {
  const cols = planChainWrite({
    fields: rawEntry("a", "genesis"),
    tail: null,
    enabled: true,
    hmacKey: HMAC,
  });
  assert.ok(cols);
  assert.equal(cols.prev_hash, null);
  assert.match(cols.entry_hash, /^[0-9a-f]{64}$/);
  assert.match(cols.hmac, /^[0-9a-f]{64}$/);
  assert.equal(cols.canonical_version, 1);
});

test("ON links to tail and produces a chain the verifier accepts", () => {
  const g = rawEntry("a", "genesis");
  const gCols = planChainWrite({ fields: g, tail: null, enabled: true, hmacKey: HMAC });
  const genesis = { ...g, ...gCols };

  const s = rawEntry("b", "step2");
  const sCols = planChainWrite({ fields: s, tail: genesis, enabled: true, hmacKey: HMAC });
  assert.equal(sCols.prev_hash, genesis.entry_hash);
  const second = { ...s, ...sCols };

  const result = verifyChain([genesis, second], { hmacKey: HMAC });
  assert.equal(result.ok, true);
});
