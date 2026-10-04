#!/usr/bin/env node
// Real development route + owner assembly.
// External auth and admin clients are doubles. Identities are synthetic.
// This is not an OAuth proof and not a Supabase session.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..", "..");
const authDoublePath = path.join(__dirname, "route-owner-auth-double.mjs");
const adminDoublePath = path.join(__dirname, "route-owner-admin-double.mjs");
const initialNodeEnv = process.env.NODE_ENV;

process.env.MICHAEL_HQ_OWNER_ID = "synthetic-owner-id";
process.env.MICHAEL_HQ_OWNER_EMAIL = "synthetic-owner@example.com";
process.env.ORIA_HQ_PUBLIC_ORIGIN = "https://hq.test";
process.env.MISSION_DURABLE_DRAFTS = "1";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    "@/lib/supabase/server": authDoublePath,
    "@/server/supabase/admin": adminDoublePath,
  },
});

const { setAuthResult } = await jiti.import(authDoublePath);
const { resetWrites, writtenRows } = await jiti.import(adminDoublePath);
const { POST, GET } = await jiti.import("./route.ts");

const input = {
  requestId: "12345678-1234-4234-8234-123456789abc",
  title: "Task",
  objective: "Goal",
  scope: "Scope",
  acceptanceCriteria: "Tests",
};

function post(body) {
  return new Request("http://internal:3000/api/missions/development", {
    method: "POST",
    headers: { origin: "https://hq.test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("development route owner boundary", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("admission boundary opened a network socket");
  };

  try {
    await t.test("absent synthetic session is 401 and writes nothing", async () => {
      resetWrites();
      setAuthResult({ user: null, error: null });
      const response = await POST(post(input));
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { status: "unauthenticated" });
      assert.equal(writtenRows().length, 0);
    });

    await t.test("synthetic non-owner is 403 and writes nothing", async () => {
      resetWrites();
      setAuthResult({
        user: { id: "synthetic-stranger", email: "stranger@example.com" },
        error: null,
      });
      const response = await POST(post(input));
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { status: "forbidden" });
      assert.equal(writtenRows().length, 0);
    });

    await t.test("owner id is the session id, and workspace comes from the server", async () => {
      resetWrites();
      setAuthResult({
        user: { id: "synthetic-owner-id", email: "not-the-owner@example.com" },
        error: null,
      });
      const response = await POST(post(input));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.status, "saved");
      assert.equal(body.executionRequested, false);
      assert.equal(body.missionStatus, "draft");
      assert.equal(writtenRows().length, 1);
      const row = writtenRows()[0];
      assert.equal(row.workspace_id, "michael-hq");
      assert.equal(row.mode_id, "hq");
      assert.equal(row.status, "draft");
      assert.equal(row.input.development.createdBy, "synthetic-owner-id");
    });

    await t.test("owner email still attributes createdBy to the session id", async () => {
      resetWrites();
      setAuthResult({
        user: { id: "synthetic-session-email", email: "Synthetic-Owner@Example.com" },
        error: null,
      });
      const response = await POST(post(input));
      assert.equal(response.status, 200);
      assert.equal(writtenRows().length, 1);
      const createdBy = writtenRows()[0].input.development.createdBy;
      assert.equal(createdBy, "synthetic-session-email");
      assert.notEqual(createdBy, "synthetic-owner-id");
      assert.equal(writtenRows()[0].workspace_id, "michael-hq");
    });

    await t.test("usurped actor and workspace fields are refused before any write", async () => {
      resetWrites();
      setAuthResult({
        user: { id: "synthetic-owner-id", email: "synthetic-owner@example.com" },
        error: null,
      });
      const response = await POST(post({
        ...input,
        createdBy: "synthetic-forged-actor",
        workspaceId: "synthetic-foreign-workspace",
        actorId: "synthetic-forged-actor",
      }));
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { status: "invalid_request" });
      assert.equal(writtenRows().length, 0);
    });

    await t.test("a production test global does not authorize the development route", async () => {
      resetWrites();
      setAuthResult({ user: null, error: null });
      globalThis.__ownerApiSessionTestResult = null;
      process.env.NODE_ENV = "production";
      try {
        const response = await POST(post(input));
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { status: "unauthenticated" });
        assert.equal(writtenRows().length, 0);
        const lookup = await GET(new Request(
          "https://hq.test/api/missions/development?requestId=12345678-1234-4234-8234-123456789abc",
        ));
        assert.equal(lookup.status, 401);
        assert.equal(writtenRows().length, 0);
      } finally {
        delete globalThis.__ownerApiSessionTestResult;
        if (initialNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = initialNodeEnv;
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__ownerApiSessionTestResult;
    if (initialNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = initialNodeEnv;
  }
});
