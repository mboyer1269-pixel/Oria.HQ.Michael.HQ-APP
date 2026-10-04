/**
 * Assertions against the disposable PostgreSQL started by
 * proofs/run-call-reservation-real-db.sh. No model and no provider network.
 * The cent amounts are fixtures for this process, not a tariff.
 * Winner and loser come from the race result, never from a fixed caller name.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const container = process.env.PG_CONTAINER;
if (!container) {
  console.error("PG_CONTAINER manquant");
  process.exit(1);
}

const INPUT_BYTES = 16;
const ROW_SQL = "select coalesce(string_agg(line, ',' order by line), '') from (select 'attempt|' || workspace_id || '|' || subject_id || '|' || caller_id || '|' || provider || '|' || model_id || '|' || currency || '|' || reserved_cents::text || '|' || state || '|' || network_emitted::text || '|' || reconciliation_required::text || '|' || max_tokens::text || '|' || input_bytes::text as line from public.hq_call_reservation union all select 'right|' || workspace_id || '|' || subject_id || '|' || caller_id as line from public.hq_call_emit_right) s;";

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", container, "psql", "-h", "127.0.0.1", "-U", "postgres", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`psql timeout: ${sql.slice(0, 80)}`));
    }, 8000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(stderr || stdout || `psql ${code}`));
      else resolve(stdout.trim());
    });
  });
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function field(jsonText, name) {
  return JSON.parse(jsonText)[name];
}

function reserve(workspaceId, subjectId, callerId, provider, modelId, maxTokens = 2048, accessClass = "api", inputBytes = INPUT_BYTES) {
  return psql(
    `select public.hq_reserve_call_attempt(${quote(workspaceId)}, ${quote(subjectId)}, ${quote(callerId)}, ${quote(provider)}, ${quote(modelId)}, ${quote(accessClass)}, ${Number(maxTokens)}, ${Number(inputBytes)});`,
  );
}

function attemptLine(workspaceId, subjectId, callerId, provider, modelId, cents, state, emitted, reconcile) {
  return `attempt|${workspaceId}|${subjectId}|${callerId}|${provider}|${modelId}|USD|${cents}|${state}|${emitted}|${reconcile}|2048|${INPUT_BYTES}`;
}

await psql("insert into public.hq_call_budget_ceiling (workspace_id, currency, max_amount_cents) values ('ws-a', 'USD', 100), ('ws-b', 'USD', 500), ('ws-c', 'USD', 100);");
await psql(`insert into public.hq_call_budget_quote
  (provider, model_id, currency, not_to_exceed_cents, quote_scope, quote_version, valid_until, covers_input_bytes, covers_output_tokens, reliable)
  values
  ('openai', 'gpt-4o-mini', 'USD', 40, 'prompt_system_output', 'fixture', now() + interval '1 day', 100000, 2048, true),
  ('anthropic', 'claude-haiku-4-5-20251001', 'USD', 80, 'prompt_system_output', 'fixture', now() + interval '1 day', 100000, 2048, true),
  ('openai', 'gpt-4o', 'USD', 50, 'prompt_system_output', 'fixture', now() + interval '1 day', 8, 2048, true),
  ('anthropic', 'claude-sonnet-4-6', 'USD', 50, 'prompt_system_output', 'fixture', now() - interval '1 hour', 100000, 2048, true);`);

const forbidden = await psql("select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('hq_call_budget_ceiling', 'hq_call_budget_quote', 'hq_call_emit_right', 'hq_call_reservation') and (column_name = 'relative_weight' or column_name = 'monetary_usd' or column_name = 'expires_at' or column_name like '%ttl%');");
assert.equal(forbidden, "0");

async function contested(workspaceId, subjectId, orderedCallers) {
  const [leftCaller, rightCaller] = orderedCallers;
  const [left, right] = await Promise.all([
    reserve(workspaceId, subjectId, leftCaller, "openai", "gpt-4o-mini"),
    reserve(workspaceId, subjectId, rightCaller, "openai", "gpt-4o-mini"),
  ]);
  const leftStatus = field(left, "status");
  const rightStatus = field(right, "status");
  assert.deepEqual([leftStatus, rightStatus].sort(), ["held", "lost"], `${subjectId} ${leftStatus},${rightStatus}`);
  const winnerCaller = leftStatus === "held" ? leftCaller : rightCaller;
  const loserCaller = winnerCaller === leftCaller ? rightCaller : leftCaller;
  const winnerJson = leftStatus === "held" ? left : right;
  const loserJson = winnerJson === left ? right : left;
  assert.equal(field(winnerJson, "currency"), "USD");
  assert.equal(field(winnerJson, "reservedCents"), 40);
  assert.equal(Object.hasOwn(JSON.parse(winnerJson), "relativeWeight"), false);
  assert.equal(field(loserJson, "reason"), "emit_right_held");
  assert.equal(field(loserJson, "reservedCents"), null);

  const stolen = await reserve(workspaceId, subjectId, loserCaller, "anthropic", "claude-haiku-4-5-20251001");
  assert.equal(field(stolen, "status"), "lost");
  assert.equal(field(stolen, "reason"), "emit_right_held");

  const winnerFallback = await reserve(workspaceId, subjectId, winnerCaller, "anthropic", "claude-haiku-4-5-20251001");
  assert.equal(field(winnerFallback, "status"), "refused");
  assert.equal(field(winnerFallback, "reason"), "ceiling_exhausted");
  assert.equal(await psql(`select count(*) from public.hq_call_reservation where workspace_id = ${quote(workspaceId)} and subject_id = ${quote(subjectId)};`), "1");

  const marked = await psql(`select public.hq_mark_call_emitted(${quote(workspaceId)}, ${quote(subjectId)}, ${quote(winnerCaller)}, 'openai');`);
  assert.equal(field(marked, "status"), "emitted_unknown");
  assert.equal(field(marked, "reconciliationRequired"), true);
  assert.equal(field(marked, "currency"), "USD");
  assert.equal(field(marked, "reservedCents"), 40);

  const released = await psql(`select public.hq_release_call_attempt(${quote(workspaceId)}, ${quote(subjectId)}, ${quote(winnerCaller)}, 'openai');`);
  assert.equal(field(released, "reason"), "release_refused");
  assert.equal(field(released, "status"), "emitted_unknown");
  assert.equal(field(released, "reservedCents"), 40);
  assert.notEqual(field(released, "reservedCents"), 0);

  const owner = await psql(`select caller_id || '|' || model_id || '|' || state || '|' || reserved_cents::text || '|' || reconciliation_required::text from public.hq_call_reservation where workspace_id = ${quote(workspaceId)} and subject_id = ${quote(subjectId)} and provider = 'openai';`);
  assert.equal(owner, `${winnerCaller}|gpt-4o-mini|emitted_unknown|40|true`);
  return winnerCaller;
}

const forwardWinner = await contested("ws-a", "mission-fwd", ["caller-a", "caller-b"]);
const reverseWinner = await contested("ws-c", "mission-rev", ["caller-b", "caller-a"]);
assert.notEqual(forwardWinner, "");
assert.notEqual(reverseWinner, "");

const isolated = await reserve("ws-b", "mission-1", "caller-c", "openai", "gpt-4o-mini");
assert.equal(field(isolated, "status"), "held");
assert.equal(field(isolated, "reservedCents"), 40);
const isolatedFallback = await reserve("ws-b", "mission-1", "caller-c", "anthropic", "claude-haiku-4-5-20251001");
assert.equal(field(isolatedFallback, "status"), "held");
assert.equal(field(isolatedFallback, "reservedCents"), 80);

const notApi = await reserve("ws-b", "mission-2", "caller-c", "openai", "gpt-4o-mini", 2048, "local");
assert.equal(field(notApi, "status"), "refused");
assert.equal(field(notApi, "reason"), "access_class");

const narrowInput = await reserve("ws-b", "mission-3", "caller-c", "openai", "gpt-4o", 2048, "api", 9);
assert.equal(field(narrowInput, "status"), "refused");
assert.equal(field(narrowInput, "reason"), "estimate_insufficient");

const expired = await reserve("ws-b", "mission-4", "caller-c", "anthropic", "claude-sonnet-4-6");
assert.equal(field(expired, "status"), "refused");
assert.equal(field(expired, "reason"), "estimate_insufficient");

const uncovered = await reserve("ws-b", "mission-5", "caller-c", "openai", "gpt-4o-mini", 2049);
assert.equal(field(uncovered, "status"), "refused");
assert.equal(field(uncovered, "reason"), "estimate_insufficient");

const expected = [
  attemptLine("ws-a", "mission-fwd", forwardWinner, "openai", "gpt-4o-mini", 40, "emitted_unknown", "true", "true"),
  attemptLine("ws-b", "mission-1", "caller-c", "anthropic", "claude-haiku-4-5-20251001", 80, "held", "false", "false"),
  attemptLine("ws-b", "mission-1", "caller-c", "openai", "gpt-4o-mini", 40, "held", "false", "false"),
  attemptLine("ws-c", "mission-rev", reverseWinner, "openai", "gpt-4o-mini", 40, "emitted_unknown", "true", "true"),
  `right|ws-a|mission-fwd|${forwardWinner}`,
  "right|ws-b|mission-1|caller-c",
  `right|ws-c|mission-rev|${reverseWinner}`,
].sort().join(",");
const before = await psql(ROW_SQL);
assert.equal(before, expected);
process.stdout.write(`BEFORE_RESTART ${before}\n`);
