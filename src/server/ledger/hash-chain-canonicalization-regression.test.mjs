import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  stableStringify,
  canonicalizeEntry,
  computeEntryHash,
} from "./hash-chain-canonicalizer.ts";

// ---------------------------------------------------------------------------
// Local replica of the canonical field order (not exported by canonicalizer)
// ---------------------------------------------------------------------------

const CANONICAL_FIELD_ORDER_V1 = [
  "id",
  "workspace_id",
  "user_id",
  "agent_id",
  "skill_id",
  "mission_id",
  "action_type",
  "event_type",
  "summary",
  "autonomy_level",
  "requires_confirmation",
  "payload",
  "metadata",
  "created_at",
];

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const BASE_ENTRY = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  workspace_id: "ws-regression",
  user_id: "user-regression",
  agent_id: null,
  skill_id: null,
  mission_id: null,
  action_type: "EXECUTE",
  event_type: "START",
  summary: "Regression baseline",
  autonomy_level: 2,
  requires_confirmation: false,
  payload: { key: "value" },
  metadata: {},
  created_at: "2024-06-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// stableStringify — key ordering regressions
// ---------------------------------------------------------------------------

test("stableStringify: object with keys in reverse alphabetical order equals forward", () => {
  const reversed = { z: 1, m: 2, a: 3 };
  const forward = { a: 3, m: 2, z: 1 };
  assert.strictEqual(stableStringify(reversed), stableStringify(forward));
  assert.strictEqual(stableStringify(reversed), '{"a":3,"m":2,"z":1}');
});

test("stableStringify: nested object — inner keys also sorted", () => {
  const obj = { outer: { z: 1, a: 2 } };
  assert.strictEqual(stableStringify(obj), '{"outer":{"a":2,"z":1}}');
});

test("stableStringify: deeply nested — all levels sorted", () => {
  const obj = { b: { d: { f: 1, e: 2 }, c: 3 }, a: 4 };
  const result = stableStringify(obj);
  assert.ok(result.indexOf('"a"') < result.indexOf('"b"'));
  assert.ok(result.indexOf('"c"') < result.indexOf('"d"'));
  assert.ok(result.indexOf('"e"') < result.indexOf('"f"'));
});

test("stableStringify: array element order is preserved (not sorted)", () => {
  assert.strictEqual(stableStringify([3, 1, 2]), "[3,1,2]");
  assert.strictEqual(stableStringify(["z", "a", "m"]), '["z","a","m"]');
});

test("stableStringify: array of objects — each object sorted, array order preserved", () => {
  const arr = [{ z: 1, a: 2 }, { y: 3, b: 4 }];
  assert.strictEqual(stableStringify(arr), '[{"a":2,"z":1},{"b":4,"y":3}]');
});

test("stableStringify: null values in object", () => {
  const obj = { z: null, a: null };
  assert.strictEqual(stableStringify(obj), '{"a":null,"z":null}');
});

test("stableStringify: null values in array", () => {
  assert.strictEqual(stableStringify([null, null]), "[null,null]");
});

test("stableStringify: boolean values sorted by key", () => {
  assert.strictEqual(stableStringify({ b: false, a: true }), '{"a":true,"b":false}');
});

test("stableStringify: zero and negative numbers", () => {
  assert.strictEqual(stableStringify({ b: -1, a: 0 }), '{"a":0,"b":-1}');
});

test("stableStringify: empty string value", () => {
  assert.strictEqual(stableStringify({ b: "y", a: "" }), '{"a":"","b":"y"}');
});

test("stableStringify: numeric string keys are sorted as strings not integers", () => {
  const obj = { "10": "ten", "2": "two", "1": "one" };
  // Alphabetical: "1", "10", "2"
  assert.strictEqual(stableStringify(obj), '{"1":"one","10":"ten","2":"two"}');
});

test("stableStringify: identical input produces identical output across multiple calls", () => {
  const obj = { z: { m: [1, 2], a: null }, b: true, a: 0 };
  const first = stableStringify(obj);
  const second = stableStringify(obj);
  const third = stableStringify(obj);
  assert.strictEqual(first, second);
  assert.strictEqual(second, third);
});

// ---------------------------------------------------------------------------
// canonicalizeEntry — field order regressions
// ---------------------------------------------------------------------------

test("canonicalizeEntry: output has v:1 as first key", () => {
  const parsed = JSON.parse(canonicalizeEntry(BASE_ENTRY));
  const keys = Object.keys(parsed);
  assert.strictEqual(keys[0], "v");
  assert.strictEqual(parsed.v, 1);
});

test("canonicalizeEntry: remaining keys follow CANONICAL_FIELD_ORDER_V1 exactly", () => {
  const parsed = JSON.parse(canonicalizeEntry(BASE_ENTRY));
  const keys = Object.keys(parsed).slice(1); // skip "v"
  for (let i = 0; i < keys.length; i++) {
    assert.strictEqual(
      keys[i],
      CANONICAL_FIELD_ORDER_V1[i],
      `Key at position ${i + 1} should be "${CANONICAL_FIELD_ORDER_V1[i]}" but got "${keys[i]}"`,
    );
  }
});

test("canonicalizeEntry: input with reversed field order produces same canonical string", () => {
  const reversed = {};
  for (const k of [...CANONICAL_FIELD_ORDER_V1].reverse()) {
    reversed[k] = BASE_ENTRY[k] ?? null;
  }
  assert.strictEqual(canonicalizeEntry(BASE_ENTRY), canonicalizeEntry(reversed));
});

test("canonicalizeEntry: extra unknown fields in input are ignored", () => {
  const withExtras = { ...BASE_ENTRY, bogus_field: "should be dropped", another: 999 };
  assert.strictEqual(canonicalizeEntry(BASE_ENTRY), canonicalizeEntry(withExtras));
});

test("canonicalizeEntry: missing optional fields normalized to null", () => {
  const minimal = { ...BASE_ENTRY };
  delete minimal.agent_id;
  delete minimal.skill_id;
  delete minimal.mission_id;
  const parsed = JSON.parse(canonicalizeEntry(minimal));
  assert.strictEqual(parsed.agent_id, null);
  assert.strictEqual(parsed.skill_id, null);
  assert.strictEqual(parsed.mission_id, null);
});

test("canonicalizeEntry: seal fields stripped from output (prev_hash, entry_hash, hmac)", () => {
  const withSeal = { ...BASE_ENTRY, prev_hash: "abc", entry_hash: "def", hmac: "ghi" };
  const canonical = canonicalizeEntry(withSeal);
  assert.ok(!canonical.includes('"prev_hash"'));
  assert.ok(!canonical.includes('"entry_hash"'));
  assert.ok(!canonical.includes('"hmac"'));
});

test("canonicalizeEntry: payload with unsorted keys is sorted in output", () => {
  const e1 = { ...BASE_ENTRY, payload: { z: 1, a: 2 } };
  const e2 = { ...BASE_ENTRY, payload: { a: 2, z: 1 } };
  assert.strictEqual(canonicalizeEntry(e1), canonicalizeEntry(e2));
  const parsed = JSON.parse(canonicalizeEntry(e1));
  assert.deepStrictEqual(Object.keys(parsed.payload), ["a", "z"]);
});

test("canonicalizeEntry: metadata with unsorted keys is sorted in output", () => {
  const e1 = { ...BASE_ENTRY, metadata: { z: "last", a: "first" } };
  const e2 = { ...BASE_ENTRY, metadata: { a: "first", z: "last" } };
  assert.strictEqual(canonicalizeEntry(e1), canonicalizeEntry(e2));
});

test("canonicalizeEntry: deeply nested payload keys sorted at all levels", () => {
  const entry = {
    ...BASE_ENTRY,
    payload: { outer: { z: 1, m: 2, a: 3 }, beta: "b", alpha: "a" },
  };
  const parsed = JSON.parse(canonicalizeEntry(entry));
  assert.deepStrictEqual(Object.keys(parsed.payload), ["alpha", "beta", "outer"]);
  assert.deepStrictEqual(Object.keys(parsed.payload.outer), ["a", "m", "z"]);
});

test("canonicalizeEntry: array payload values preserve element order", () => {
  const entry = { ...BASE_ENTRY, payload: { items: [3, 1, 2] } };
  const parsed = JSON.parse(canonicalizeEntry(entry));
  assert.deepStrictEqual(parsed.payload.items, [3, 1, 2]);
});

test("canonicalizeEntry: null payload stays null in output", () => {
  const entry = { ...BASE_ENTRY, payload: null };
  const parsed = JSON.parse(canonicalizeEntry(entry));
  assert.strictEqual(parsed.payload, null);
});

test("canonicalizeEntry: autonomy_level 0 (falsy number) is preserved", () => {
  const entry = { ...BASE_ENTRY, autonomy_level: 0 };
  const parsed = JSON.parse(canonicalizeEntry(entry));
  assert.strictEqual(parsed.autonomy_level, 0);
});

test("canonicalizeEntry: requires_confirmation false (falsy bool) is preserved", () => {
  const entry = { ...BASE_ENTRY, requires_confirmation: false };
  const parsed = JSON.parse(canonicalizeEntry(entry));
  assert.strictEqual(parsed.requires_confirmation, false);
});

test("canonicalizeEntry: output is a single line with no embedded newlines", () => {
  const result = canonicalizeEntry(BASE_ENTRY);
  assert.ok(!result.includes("\n"), "no newlines");
  assert.ok(!result.includes("\r"), "no carriage returns");
});

test("canonicalizeEntry: deterministic across ten consecutive calls", () => {
  const first = canonicalizeEntry(BASE_ENTRY);
  for (let i = 0; i < 9; i++) {
    assert.strictEqual(canonicalizeEntry(BASE_ENTRY), first);
  }
});

// ---------------------------------------------------------------------------
// computeEntryHash — stability regressions
// ---------------------------------------------------------------------------

test("computeEntryHash: same entry + same prevHash always produces same hash", () => {
  const h1 = computeEntryHash(BASE_ENTRY, null);
  const h2 = computeEntryHash(BASE_ENTRY, null);
  const h3 = computeEntryHash(BASE_ENTRY, null);
  assert.strictEqual(h1, h2);
  assert.strictEqual(h2, h3);
});

test("computeEntryHash: field insertion order does not affect hash", () => {
  const reversed = {};
  for (const k of [...CANONICAL_FIELD_ORDER_V1].reverse()) {
    reversed[k] = BASE_ENTRY[k] ?? null;
  }
  assert.strictEqual(computeEntryHash(BASE_ENTRY, null), computeEntryHash(reversed, null));
});

test("computeEntryHash: payload key ordering does not affect hash", () => {
  const e1 = { ...BASE_ENTRY, payload: { z: 1, a: 2 } };
  const e2 = { ...BASE_ENTRY, payload: { a: 2, z: 1 } };
  assert.strictEqual(computeEntryHash(e1, null), computeEntryHash(e2, null));
});

test("computeEntryHash: metadata key ordering does not affect hash", () => {
  const e1 = { ...BASE_ENTRY, metadata: { z: "last", a: "first" } };
  const e2 = { ...BASE_ENTRY, metadata: { a: "first", z: "last" } };
  assert.strictEqual(computeEntryHash(e1, null), computeEntryHash(e2, null));
});

test("computeEntryHash: extra unknown fields do not affect hash", () => {
  const withExtra = { ...BASE_ENTRY, bogus: "ignored" };
  assert.strictEqual(computeEntryHash(BASE_ENTRY, null), computeEntryHash(withExtra, null));
});

test("computeEntryHash: seal fields in input do not affect hash (stripped before hashing)", () => {
  const withSeal = {
    ...BASE_ENTRY,
    prev_hash: "some-prior-hash",
    entry_hash: "some-stale-hash",
    hmac: "some-hmac",
  };
  assert.strictEqual(computeEntryHash(BASE_ENTRY, null), computeEntryHash(withSeal, null));
});

test("computeEntryHash: changing any canonical field changes the hash", () => {
  const mutableFields = CANONICAL_FIELD_ORDER_V1.filter(
    (f) => !["agent_id", "skill_id", "mission_id"].includes(f),
  );
  const baseHash = computeEntryHash(BASE_ENTRY, null);
  for (const field of mutableFields) {
    const modified = {
      ...BASE_ENTRY,
      [field]: typeof BASE_ENTRY[field] === "string" ? BASE_ENTRY[field] + "_MUTATED" : "mutated",
    };
    const modHash = computeEntryHash(modified, null);
    assert.notStrictEqual(baseHash, modHash, `Changing field "${field}" should change the hash`);
  }
});

test("computeEntryHash: changing prevHash changes the output hash", () => {
  const h1 = computeEntryHash(BASE_ENTRY, null);
  const h2 = computeEntryHash(BASE_ENTRY, "a".repeat(64));
  assert.notStrictEqual(h1, h2);
});

test("computeEntryHash: output is always 64-character lowercase hex", () => {
  const h = computeEntryHash(BASE_ENTRY, null);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("computeEntryHash: chained hashes are each 64-char hex", () => {
  const h1 = computeEntryHash(BASE_ENTRY, null);
  const e2 = { ...BASE_ENTRY, id: "aaaaaaaa-0000-0000-0000-000000000002" };
  const h2 = computeEntryHash(e2, h1);
  const e3 = { ...BASE_ENTRY, id: "aaaaaaaa-0000-0000-0000-000000000003" };
  const h3 = computeEntryHash(e3, h2);
  for (const h of [h1, h2, h3]) {
    assert.match(h, /^[0-9a-f]{64}$/);
  }
  // each step must differ
  assert.notStrictEqual(h1, h2);
  assert.notStrictEqual(h2, h3);
});
