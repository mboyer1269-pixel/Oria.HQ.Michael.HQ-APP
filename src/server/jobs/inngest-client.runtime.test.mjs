#!/usr/bin/env node

// src/server/jobs/inngest-client.runtime.test.mjs
//
// Lot A' (audit): drive the REAL app wiring — src/app/api/inngest/route.ts with
// the shared `michael-hq` client and the real jorisExecuteJob — with a real
// `joris/execute` payload. No Inngest account, no network: dev mode, the serve
// handler is called directly with Request objects.
//
// The step itself is replayed from memoized state so runJorisCommand is NOT
// executed here (it would need a workspace/DB). What is proven: the real client
// registers both functions, accepts a well-formed joris/execute event, resolves
// the lazy imports (brain, workspace-context) and returns the step result.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
// MERGE-3: the job resolves a real authz context since #410 — declare the test member and workspace.
process.env.ORIA_WORKSPACE_MEMBERS = JSON.stringify([{ userId: "00000000-0000-4000-8000-000000000002", workspaceId: "ws-inngest", role: "owner" }]);

process.env.INNGEST_DEV = "1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { GET, POST } = await jiti.import("@/app/api/inngest/route");
const { inngest } = await jiti.import("@/server/jobs/inngest-client");

const BASE = "http://localhost:3000/api/inngest";
const headers = { host: "localhost:3000", "content-type": "application/json" };

const payload = {
  workspaceId: "ws-inngest", // MERGE-3: #410 validates the workspace → a configured one (below)
  userId: "00000000-0000-4000-8000-000000000002",
  message: "Planifie la réunion de vendredi avec Hélène",
  locale: "fr-CA",
};

function execBody(steps) {
  const event = { name: "joris/execute", data: payload, ts: Date.now() };
  return JSON.stringify({
    event,
    events: [event],
    steps,
    ctx: { run_id: "run-a-prime", attempt: 0, stack: { stack: Object.keys(steps), current: 0 } },
    version: 1,
    use_api: false,
  });
}

test("real Inngest client + route accept a joris/execute payload", async (t) => {
  assert.equal(inngest.id, "michael-hq");

  await t.test("introspection of the real route lists joris-execute and the cron", async () => {
    const res = await GET(new Request(BASE, { headers }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.function_count, 2);
    assert.equal(body.mode, "dev");
  });

  await t.test("joris/execute replays the memoized step and returns its result", async () => {
    // inngest v3 step ids are sha1 hex of the step name.
    const stepId = createHash("sha1").update("run-joris-command").digest("hex");
    const memo = { ok: true, intent: "test", reply: "Réunion notée — éàçô" };
    const res = await POST(
      new Request(`${BASE}?fnId=michael-hq-joris-execute&stepId=step`, {
        method: "POST",
        headers,
        body: execBody({ [stepId]: { data: memo } }),
      }),
    );
    const text = await res.text();
    assert.equal(res.status, 200, text);
    assert.deepEqual(JSON.parse(text), memo);
  });
});
