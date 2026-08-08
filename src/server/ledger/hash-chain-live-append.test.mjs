#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";
import { verifyChain } from "./hash-chain-verifier.ts";
import { resolveChainColumns } from "./hash-chain-live-append.ts";

const HMAC = "test-hmac-key-never-from-env";

function content(overrides = {}) {
  return {
    id: "led_1",
    workspaceId: "ws_a",
    userId: "user_1",
    actionType: "calendar.book",
    eventType: "decision",
    summary: "Book meeting",
    autonomyLevel: 1,
    requiresConfirmation: true,
    payload: {},
    metadata: {},
    createdAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
}

test("resolveChainColumns returns null when write flag is OFF", () => {
  const cols = resolveChainColumns(content(), null, {
    enabled: false,
    env: {},
  });
  assert.equal(cols, null);
});

test("resolveChainColumns seals genesis then successor when ON", () => {
  const gCols = resolveChainColumns(content({ id: "led_g" }), null, {
    enabled: true,
    hmacKey: HMAC,
  });
  assert.ok(gCols);
  assert.equal(gCols.prev_hash, null);
  assert.equal(typeof gCols.entry_hash, "string");
  assert.equal(gCols.entry_hash.length, 64);

  const sCols = resolveChainColumns(
    content({ id: "led_s", summary: "Second", createdAt: "2026-08-08T12:01:00.000Z" }),
    { entry_hash: gCols.entry_hash },
    { enabled: true, hmacKey: HMAC },
  );
  assert.ok(sCols);
  assert.equal(sCols.prev_hash, gCols.entry_hash);

  const chain = [
    {
      ...content({ id: "led_g" }),
      id: "led_g",
      workspace_id: "ws_a",
      user_id: "user_1",
      agent_id: null,
      skill_id: null,
      mission_id: null,
      action_type: "calendar.book",
      event_type: "decision",
      summary: "Book meeting",
      autonomy_level: 1,
      requires_confirmation: true,
      payload: {},
      metadata: {},
      created_at: "2026-08-08T12:00:00.000Z",
      prev_hash: gCols.prev_hash,
      entry_hash: gCols.entry_hash,
      hmac: gCols.hmac,
      canonical_version: gCols.canonical_version,
    },
    {
      id: "led_s",
      workspace_id: "ws_a",
      user_id: "user_1",
      agent_id: null,
      skill_id: null,
      mission_id: null,
      action_type: "calendar.book",
      event_type: "decision",
      summary: "Second",
      autonomy_level: 1,
      requires_confirmation: true,
      payload: {},
      metadata: {},
      created_at: "2026-08-08T12:01:00.000Z",
      prev_hash: sCols.prev_hash,
      entry_hash: sCols.entry_hash,
      hmac: sCols.hmac,
      canonical_version: sCols.canonical_version,
    },
  ];

  assert.equal(verifyChain(chain, { hmacKey: HMAC }).ok, true);
});

test("resolveChainColumns throws when ON without hmac key", () => {
  assert.throws(
    () => resolveChainColumns(content(), null, { enabled: true, env: {} }),
    /hmacKey is required/,
  );
});
