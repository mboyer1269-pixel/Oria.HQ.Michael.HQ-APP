#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../../..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { deriveLedgerTone, encodeTheatreSse } = await jiti.import(
  path.join(__dirname, "theatre-events.ts"),
);
const { diffTheatreSnapshots } = await jiti.import(
  path.join(projectRoot, "src/server/hq/theatre-stream.ts"),
);

describe("deriveLedgerTone", () => {
  it("marks approval / decision as amber", () => {
    assert.equal(deriveLedgerTone({ eventType: "decision", summary: "queued for approval" }), "amber");
  });

  it("marks failures as red", () => {
    assert.equal(deriveLedgerTone({ eventType: "result", summary: "dispatch failed" }), "red");
  });

  it("marks actions as neon", () => {
    assert.equal(deriveLedgerTone({ eventType: "action", summary: "Dispatching intent" }), "neon");
  });
});

describe("encodeTheatreSse", () => {
  it("emits event name + data payload", () => {
    const chunk = encodeTheatreSse({
      type: "hello",
      workspaceId: "michael-hq",
      emittedAt: "2026-08-08T00:00:00.000Z",
    });
    assert.match(chunk, /^event: hello\n/);
    assert.match(chunk, /data: \{.*"workspaceId":"michael-hq".*\}\n\n/);
  });
});

describe("diffTheatreSnapshots", () => {
  const base = {
    workspaceId: "michael-hq",
    ledgerSource: "local",
    ledger: [],
    intents: [],
  };

  it("emits snapshots on first poll", () => {
    const events = diffTheatreSnapshots(
      null,
      {
        ...base,
        ledger: [
          {
            id: "a1",
            summary: "hello",
            eventType: "action",
            agentId: "joris",
            skillId: "calendar.book",
            actionType: "calendar.book",
            autonomyLevel: 2,
            createdAt: "2026-08-08T00:00:01.000Z",
            tone: "neon",
          },
        ],
        intents: [
          {
            intentId: "i1",
            agentId: "hermes",
            skillId: "task.create",
            toolName: "n8n_webhook_trigger",
            autonomyLevel: 2,
            status: "pending",
            createdAt: "2026-08-08T00:00:02.000Z",
          },
        ],
      },
      "t0",
    );

    assert.equal(events[0].type, "ledger.snapshot");
    assert.equal(events[1].type, "intent.snapshot");
  });

  it("emits append + upsert + remove deltas", () => {
    const previous = {
      ...base,
      ledger: [
        {
          id: "a1",
          summary: "old",
          eventType: "action",
          agentId: null,
          skillId: null,
          actionType: null,
          autonomyLevel: null,
          createdAt: "t1",
          tone: "neon",
        },
      ],
      intents: [
        {
          intentId: "gone",
          agentId: "hermes",
          skillId: "task.create",
          toolName: "n8n_webhook_trigger",
          autonomyLevel: 2,
          status: "pending",
          createdAt: "t1",
        },
      ],
    };

    const next = {
      ...base,
      ledger: [
        {
          id: "a2",
          summary: "new",
          eventType: "result",
          agentId: "hermes",
          skillId: "task.create",
          actionType: "send_email",
          autonomyLevel: 2,
          createdAt: "t2",
          tone: "neon",
        },
        previous.ledger[0],
      ],
      intents: [
        {
          intentId: "fresh",
          agentId: "hermes",
          skillId: "task.create",
          toolName: "n8n_webhook_trigger",
          autonomyLevel: 2,
          status: "pending",
          createdAt: "t2",
        },
      ],
    };

    const events = diffTheatreSnapshots(previous, next, "t3");
    assert.deepEqual(
      events.map((e) => e.type),
      ["ledger.append", "intent.upsert", "intent.remove"],
    );
  });
});
