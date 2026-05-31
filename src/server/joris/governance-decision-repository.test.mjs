// src/server/joris/governance-decision-repository.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Force the local-fallback path deterministically: with no Supabase config the
// repository resolves a null client. serverEnv reads process.env eagerly at
// import, so these must be cleared before the module is imported below.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Governance Decision repository tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const repoMod = await jiti.import(path.join(__dirname, "governance-decision-repository.ts"));
  const {
    recordGovernanceDecision,
    getGovernanceDecisionsForWorkspace,
    getGovernanceDecisionsForWorkOrder,
    getLatestGovernanceDecision,
    GovernanceDecisionRepositoryError,
    __clearGovernanceDecisionsForTests,
  } = repoMod;

  const contractMod = await jiti.import(
    path.join(projectRoot, "src/server/agents/work-order-governance-decision-contract.ts"),
  );
  const { buildGovernanceDecisionRecord } = contractMod;

  const previewMod = await jiti.import(path.join(__dirname, "governance-bundle-preview.ts"));
  const { buildJorisGovernanceBundlePreview } = previewMod;

  const applicatorMod = await jiti.import(
    path.join(__dirname, "governance-bundle-review-applicator.ts"),
  );
  const { applyReviewToGovernanceBundle } = applicatorMod;

  function workOrder(id) {
    return {
      id,
      type: "mission",
      title: "Repo Test Mission",
      ownerAgentId: "joris",
      assignedAgentId: "joris",
      objective: "Validate the decision repository",
      expectedOutput: { description: "Test report", outputType: "report" },
      boostersRequested: [],
      riskLevel: "low",
      approvalGates: [],
      successMetric: { description: "Tests pass" },
      nextAction: { description: "Review output", actor: "joris" },
      businessValue: { valueType: "learning", confidence: "low" },
      status: "draft",
      createdByType: "joris",
      createdById: "joris",
      createdAt: "2026-05-29T10:00:00.000Z",
    };
  }

  function decisionRecord(workspaceId, woId, message) {
    const preview = buildJorisGovernanceBundlePreview({
      workOrder: workOrder(woId),
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T10:00:00.000Z",
    }).bundle;
    const application = applyReviewToGovernanceBundle({
      bundle: preview,
      message,
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T11:00:00.000Z",
    });
    assert.equal(application.applied, true);
    return buildGovernanceDecisionRecord({ bundle: application.bundle, workspaceId });
  }

  // -------------------------------------------------------------------------
  // Supabase client mock + factory injection (mirrors arena-verdict-repository)
  // -------------------------------------------------------------------------

  function installSupabaseClientFactory(factory) {
    globalThis.__governanceDecisionRepositoryClientFactory = factory;
  }
  function clearSupabaseClientFactory() {
    delete globalThis.__governanceDecisionRepositoryClientFactory;
  }

  // A minimal chainable, thenable query builder. select/eq/order return `this`;
  // awaiting the builder resolves to { data, error }. insert returns a promise.
  function makeSupabaseMock({ insertError = null, listData = [], listError = null, onInsert } = {}) {
    const builder = {
      _result: { data: listData, error: listError },
      appliedLimit: undefined,
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit(n) { this.appliedLimit = n; return this; },
      insert(row) {
        if (onInsert) onInsert(row);
        return Promise.resolve({ data: null, error: insertError });
      },
      then(resolve) { return Promise.resolve(this._result).then(resolve); },
    };
    return { from() { return builder; }, __builder: builder };
  }

  t.beforeEach(() => {
    clearSupabaseClientFactory();
    __clearGovernanceDecisionsForTests();
  });
  t.afterEach(() => {
    clearSupabaseClientFactory();
    __clearGovernanceDecisionsForTests();
  });

  // -------------------------------------------------------------------------
  // Local-fallback path (no Supabase client)
  // -------------------------------------------------------------------------

  await t.test("records a valid decision and returns a copy", async () => {
    const record = decisionRecord("ws1", "wo_1", "Approuve pour le plan");
    const stored = await recordGovernanceDecision(record);
    assert.equal(stored.id, record.id);
    assert.equal(stored.outcome, "approved_to_plan");
    assert.notEqual(stored, record, "returns a defensive copy, not the same reference");
  });

  await t.test("getGovernanceDecisionsForWorkspace returns most-recent first", async () => {
    await recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    await recordGovernanceDecision(decisionRecord("ws1", "wo_2", "Non, rejette cette idée"));
    const list = await getGovernanceDecisionsForWorkspace("ws1");
    assert.equal(list.length, 2);
    assert.equal(list[0].workOrderId, "wo_2", "most recent first");
    assert.equal(list[1].workOrderId, "wo_1");
  });

  await t.test("workspace isolation: decisions do not leak across workspaces", async () => {
    await recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    await recordGovernanceDecision(decisionRecord("ws2", "wo_9", "Approuve pour le plan"));
    assert.equal((await getGovernanceDecisionsForWorkspace("ws1")).length, 1);
    assert.equal((await getGovernanceDecisionsForWorkspace("ws2")).length, 1);
    assert.equal((await getGovernanceDecisionsForWorkspace("ws3")).length, 0);
  });

  await t.test("getGovernanceDecisionsForWorkOrder filters by work order", async () => {
    await recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    await recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Modifie le budget stp"));
    await recordGovernanceDecision(decisionRecord("ws1", "wo_2", "Non, rejette cette idée"));
    const list = await getGovernanceDecisionsForWorkOrder("ws1", "wo_1");
    assert.equal(list.length, 2);
    assert.ok(list.every((r) => r.workOrderId === "wo_1"));
  });

  await t.test("getLatestGovernanceDecision returns the most recent or null", async () => {
    assert.equal(await getLatestGovernanceDecision("ws1", "wo_1"), null);
    await recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    await recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Non, rejette cette idée"));
    const latest = await getLatestGovernanceDecision("ws1", "wo_1");
    assert.ok(latest);
    assert.equal(latest.outcome, "rejected");
  });

  await t.test("limit bounds the result, most-recent first (local fallback)", async () => {
    await recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    await recordGovernanceDecision(decisionRecord("ws1", "wo_2", "Non, rejette cette idée"));
    await recordGovernanceDecision(decisionRecord("ws1", "wo_3", "Approuve pour le plan"));

    const ws = await getGovernanceDecisionsForWorkspace("ws1", { limit: 2 });
    assert.equal(ws.length, 2, "limit caps the workspace read");
    assert.equal(ws[0].workOrderId, "wo_3", "most recent first under a limit");

    await recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Non, rejette cette idée"));
    const wo = await getGovernanceDecisionsForWorkOrder("ws1", "wo_1", { limit: 1 });
    assert.equal(wo.length, 1, "limit caps the work-order read");
    assert.equal(wo[0].outcome, "rejected", "keeps the most recent");
  });

  await t.test("a non-positive or absent limit means no bound (local fallback)", async () => {
    await recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    await recordGovernanceDecision(decisionRecord("ws1", "wo_2", "Non, rejette cette idée"));
    assert.equal((await getGovernanceDecisionsForWorkspace("ws1")).length, 2);
    assert.equal((await getGovernanceDecisionsForWorkspace("ws1", { limit: 0 })).length, 2);
    assert.equal((await getGovernanceDecisionsForWorkspace("ws1", { limit: -5 })).length, 2);
  });

  await t.test("refuses to persist an invalid record (non-decided outcome)", async () => {
    // A preview bundle yields outcome "preview" → invalid.
    const preview = buildJorisGovernanceBundlePreview({
      workOrder: workOrder("wo_bad"),
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T10:00:00.000Z",
    }).bundle;
    const invalid = buildGovernanceDecisionRecord({ bundle: preview, workspaceId: "ws1" });
    await assert.rejects(
      () => recordGovernanceDecision(invalid),
      /invalid governance decision record/i,
    );
    assert.equal((await getGovernanceDecisionsForWorkspace("ws1")).length, 0);
  });

  await t.test("stored records preserve no-execution invariants", async () => {
    await recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    const [rec] = await getGovernanceDecisionsForWorkspace("ws1");
    assert.equal(rec.humanOnTheLoop, true);
    assert.equal(rec.noExecutionAuthorized, true);
  });

  await t.test("production without Supabase or local fallback refuses to persist (loud)", async () => {
    const record = decisionRecord("ws1", "wo_1", "Approuve pour le plan");
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      await assert.rejects(
        () => recordGovernanceDecision(record),
        /unavailable/i,
        "must throw in production without a Supabase implementation",
      );
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
    // Back in non-production, persistence works again.
    const stored = await recordGovernanceDecision(record);
    assert.equal(stored.outcome, "approved_to_plan");
  });

  // -------------------------------------------------------------------------
  // Supabase path (injected client)
  // -------------------------------------------------------------------------

  await t.test("Supabase: record inserts a snake_case row with no-execution belts", async () => {
    let inserted = null;
    installSupabaseClientFactory(() => makeSupabaseMock({ onInsert: (row) => { inserted = row; } }));

    const record = decisionRecord("ws-sb", "wo_sb_1", "Approuve pour le plan");
    const stored = await recordGovernanceDecision(record);

    assert.equal(stored.id, record.id);
    assert.ok(inserted, "insert must be called on the Supabase client");
    assert.equal(inserted.workspace_id, "ws-sb");
    assert.equal(inserted.work_order_id, "wo_sb_1");
    assert.equal(inserted.outcome, "approved_to_plan");
    assert.equal(inserted.human_on_the_loop, true);
    assert.equal(inserted.no_execution_authorized, true);
    // No in-memory leak when Supabase is the backend.
    clearSupabaseClientFactory();
    assert.equal((await getGovernanceDecisionsForWorkspace("ws-sb")).length, 0);
  });

  await t.test("Supabase: list maps rows back to records, most-recent first", async () => {
    const rows = [
      {
        id: "govdec_2", workspace_id: "ws-sb", work_order_id: "wo_2", bundle_id: "b2",
        outcome: "rejected", session_status: "rejected", review_id: "rev2", review_decision: "reject",
        reviewer_id: "michael", reviewer_role: "ceo", human_on_the_loop: true,
        no_execution_authorized: true, decided_at: "2026-05-29T12:00:00.000Z",
        created_at: "2026-05-29T12:00:00.000Z",
      },
      {
        id: "govdec_1", workspace_id: "ws-sb", work_order_id: "wo_1", bundle_id: "b1",
        outcome: "approved_to_plan", session_status: "approved_to_plan", review_id: null,
        review_decision: null, reviewer_id: "michael", reviewer_role: "ceo", human_on_the_loop: true,
        no_execution_authorized: true, decided_at: "2026-05-29T11:00:00.000Z",
        created_at: "2026-05-29T11:00:00.000Z",
      },
    ];
    installSupabaseClientFactory(() => makeSupabaseMock({ listData: rows }));

    const list = await getGovernanceDecisionsForWorkspace("ws-sb");
    assert.equal(list.length, 2);
    assert.equal(list[0].outcome, "rejected");
    assert.equal(list[0].reviewId, "rev2");
    assert.equal(list[1].outcome, "approved_to_plan");
    assert.equal(list[1].reviewId, undefined, "null review_id maps to absent reviewId");
    assert.equal(list[1].workOrderId, "wo_1");
  });

  await t.test("Supabase: insert error surfaces a sanitized repository error", async () => {
    const leaky = new Error("connection string secret token");
    installSupabaseClientFactory(() => makeSupabaseMock({ insertError: leaky }));

    await assert.rejects(
      () => recordGovernanceDecision(decisionRecord("ws-sb", "wo_e", "Approuve pour le plan")),
      (err) =>
        err instanceof GovernanceDecisionRepositoryError &&
        /record/i.test(err.message) &&
        !err.message.includes("secret") &&
        !err.message.includes("token"),
    );
  });

  await t.test("Supabase: list error surfaces a sanitized repository error", async () => {
    installSupabaseClientFactory(() => makeSupabaseMock({ listError: new Error("read boom") }));
    await assert.rejects(
      () => getGovernanceDecisionsForWorkspace("ws-sb"),
      (err) => err instanceof GovernanceDecisionRepositoryError && /list/i.test(err.message),
    );
  });

  await t.test("Supabase: limit is pushed down to the query", async () => {
    const mock = makeSupabaseMock({ listData: [] });
    installSupabaseClientFactory(() => mock);

    await getGovernanceDecisionsForWorkspace("ws-sb", { limit: 5 });
    assert.equal(mock.__builder.appliedLimit, 5, "workspace read pushes the limit down");

    mock.__builder.appliedLimit = undefined;
    await getGovernanceDecisionsForWorkspace("ws-sb");
    assert.equal(mock.__builder.appliedLimit, undefined, "no limit option → no .limit() call");

    mock.__builder.appliedLimit = undefined;
    await getLatestGovernanceDecision("ws-sb", "wo_x");
    assert.equal(mock.__builder.appliedLimit, 1, "getLatest bounds the read to a single row");
  });
});
