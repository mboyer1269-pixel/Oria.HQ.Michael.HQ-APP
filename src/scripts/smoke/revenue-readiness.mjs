#!/usr/bin/env node
/**
 * Revenue readiness smoke check.
 *
 * Health smokes prove the system RESPONDS. This one proves the system is
 * PRODUCTIVE: that the Hermès prep loop turns venture context into at least one
 * CEO-reviewable cash action. A system can pass every health check and still
 * generate $0 — this smoke is the alarm for that "healthy but sterile" state.
 *
 * What it does (LOCAL mode, no API keys, no Supabase write):
 *   1. Generate cash action packets from the venture seed (fallback path — no
 *      ANTHROPIC/OPENAI key required).
 *   2. Run one Hermès prep tick to compose + enqueue prepared actions into the
 *      in-memory prepared-action store.
 *   3. Assert at least one PreparedAction with status "ready_for_ceo_review" and
 *      a createdAt within the last 48h exists for the workspace.
 *
 * Exits 0 on pass (productive), 1 on fail (sterile or broken).
 *
 * It NEVER sends, contacts, charges, or executes anything.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Force LOCAL mode: no Supabase write, in-memory prepared-action fallback.
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const FRESH_WINDOW_MS = 48 * 60 * 60 * 1000;
const WORKSPACE_ID = "smoke-revenue-ws";
const USER_ID = "00000000-0000-0000-0000-000000000000";

function fail(message) {
  console.error(`[smoke:revenue] FAIL — ${message}`);
  process.exit(1);
}

console.log("[smoke:revenue] mode: LOCAL (no Supabase write, in-memory queue)");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(__dirname, "server-only-stub.mjs"),
  },
});

const featureDir = path.join(projectRoot, "src", "features", "ventures");
const serverDir = path.join(projectRoot, "src", "server", "ventures");

const { generateLlmCashActionPacketsFromVentures, ORYA_VENTURES } = await jiti.import(
  path.join(featureDir, "llm-cash-action-packet-generator.ts"),
);
const { AGENT_VENTURE_WORKBENCH_ITEMS } = await jiti.import(
  path.join(featureDir, "agent-venture-workbench-data.ts"),
);
const { runHermesPrepTick } = await jiti.import(path.join(serverDir, "hermes-prep-tick.ts"));
const { listPreparedActionsForWorkspace, __clearPreparedActionsForTests } = await jiti.import(
  path.join(serverDir, "prepared-action-repository.ts"),
);

// Start from a clean in-memory queue so the assertion reflects THIS run.
__clearPreparedActionsForTests();

const generatedAt = new Date().toISOString();

// 1. Generate packets (seed fallback — no API key needed).
let genResult;
try {
  genResult = await generateLlmCashActionPacketsFromVentures({
    ventures: ORYA_VENTURES,
    fallbackItems: AGENT_VENTURE_WORKBENCH_ITEMS,
    createdAt: generatedAt,
  });
} catch (err) {
  fail(`packet generation threw: ${err?.message ?? err}`);
}
console.log(`[smoke:revenue] packets generated: ${genResult.packets.length} (source: ${genResult.source})`);
if (genResult.packets.length === 0) {
  fail("no cash action packets generated — venture seed produced nothing.");
}

// 2. Run one Hermès prep tick (composes council + plan, enqueues to local store).
let tick;
try {
  tick = await runHermesPrepTick({
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    packets: genResult.packets,
  });
} catch (err) {
  fail(`hermes prep tick threw: ${err?.message ?? err}`);
}
console.log(
  `[smoke:revenue] prep tick: created=${tick.plan.summary.created} enqueued=${tick.enqueued.length}`,
);

// 3. Assert at least one fresh ready_for_ceo_review action exists.
let prepared;
try {
  prepared = await listPreparedActionsForWorkspace(WORKSPACE_ID);
} catch (err) {
  fail(`listing prepared actions threw: ${err?.message ?? err}`);
}

const now = Date.now();
const readyFresh = prepared.filter((action) => {
  if (action.status !== "ready_for_ceo_review") return false;
  const ageMs = now - Date.parse(action.createdAt);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= FRESH_WINDOW_MS;
});

console.log(
  `[smoke:revenue] prepared total=${prepared.length} ready_for_ceo_review(<48h)=${readyFresh.length}`,
);

if (readyFresh.length === 0) {
  fail(
    "system is healthy but STERILE — no fresh CEO-reviewable cash action in the last 48h.",
  );
}

for (const action of readyFresh.slice(0, 3)) {
  console.log(
    `  [ok] ${action.preparedActionId} · venture=${action.ventureId} · priority=${action.priority} · channel=${action.hermesPlan.channel}`,
  );
}

// Governance guard: prepared work must remain proposal-only.
const unsafe = readyFresh.find(
  (a) => a.requiresCeoApproval !== true || a.noExecutionAuthorized !== true,
);
if (unsafe) {
  fail(`prepared action ${unsafe.preparedActionId} is not proposal-only — governance lock broken.`);
}

console.log(`[smoke:revenue] PASS — ${readyFresh.length} fresh CEO-ready cash action(s).`);
process.exit(0);
