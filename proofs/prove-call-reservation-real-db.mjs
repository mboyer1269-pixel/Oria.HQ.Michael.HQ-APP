/**
 * Assertions against the disposable PostgreSQL started by
 * proofs/run-call-reservation-real-db.sh. No model and no provider network.
 * The 40 and 80 cent rows are fixtures for this process, not a tariff.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const container = process.env.PG_CONTAINER;
if (!container) {
  console.error("PG_CONTAINER manquant");
  process.exit(1);
}

const RESTART_SQL = "select (select coalesce(string_agg(line, ',' order by line), '') from (select state || '|' || reconciliation_required::text || '|' || reserved_cents::text || '|' || count(*)::text as line from public.hq_call_reservation group by state, reconciliation_required, reserved_cents) s) || ';' || (select count(*)::text from public.hq_call_emit_right);";

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

function reserve(workspaceId, subjectId, callerId, provider, modelId, maxTokens = 2048, accessClass = "api") {
  return psql(
    `select public.hq_reserve_call_attempt(${quote(workspaceId)}, ${quote(subjectId)}, ${quote(callerId)}, ${quote(provider)}, ${quote(modelId)}, ${quote(accessClass)}, ${Number(maxTokens)});`,
  );
}

await psql("insert into public.hq_call_budget_ceiling (workspace_id, currency, max_amount_cents) values ('ws-a', 'USD', 100), ('ws-b', 'USD', 500);");
await psql(`insert into public.hq_call_budget_quote (provider, model_id, currency, not_to_exceed_cents, covers_max_tokens, reliable) values
  ('openai', 'gpt-4o-mini', 'USD', 40, 2048, true),
  ('anthropic', 'claude-haiku-4-5-20251001', 'USD', 80, 2048, true),
  ('openai', 'gpt-4o', 'USD', 50, 2048, false);`);

const forbidden = await psql("select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('hq_call_budget_ceiling', 'hq_call_budget_quote', 'hq_call_emit_right', 'hq_call_reservation') and (column_name = 'relative_weight' or column_name = 'monetary_usd' or column_name = 'expires_at' or column_name like '%ttl%');");
assert.equal(forbidden, "0");

const [first, second] = await Promise.all([
  reserve("ws-a", "mission-1", "caller-a", "openai", "gpt-4o-mini"),
  reserve("ws-a", "mission-1", "caller-b", "openai", "gpt-4o-mini"),
]);
const statuses = [field(first, "status"), field(second, "status")].sort();
assert.deepEqual(statuses, ["held", "lost"], `concurrence ${statuses.join(",")}`);
const winner = field(first, "status") === "held" ? first : second;
const loser = winner === first ? second : first;
assert.equal(field(winner, "currency"), "USD");
assert.equal(field(winner, "reservedCents"), 40);
assert.equal(field(loser, "reason"), "emit_right_held");
assert.equal(field(loser, "reservedCents"), null);
assert.equal(Object.hasOwn(JSON.parse(winner), "relativeWeight"), false);

const stolenFallback = await reserve("ws-a", "mission-1", "caller-b", "anthropic", "claude-haiku-4-5-20251001");
assert.equal(field(stolenFallback, "status"), "lost");
assert.equal(field(stolenFallback, "reason"), "emit_right_held");

const winnerFallback = await reserve("ws-a", "mission-1", "caller-a", "anthropic", "claude-haiku-4-5-20251001");
assert.equal(field(winnerFallback, "status"), "refused");
assert.equal(field(winnerFallback, "reason"), "ceiling_exhausted");
assert.equal(await psql("select count(*) from public.hq_call_reservation where workspace_id = 'ws-a';"), "1");

const marked = await psql("select public.hq_mark_call_emitted('ws-a', 'mission-1', 'caller-a', 'openai');");
assert.equal(field(marked, "status"), "emitted_unknown");
assert.equal(field(marked, "reconciliationRequired"), true);
assert.equal(field(marked, "currency"), "USD");
assert.equal(field(marked, "reservedCents"), 40);

const released = await psql("select public.hq_release_call_attempt('ws-a', 'mission-1', 'caller-a', 'openai');");
assert.equal(field(released, "reason"), "release_refused");
assert.equal(field(released, "status"), "emitted_unknown");
assert.equal(field(released, "reservedCents"), 40);
assert.notEqual(field(released, "reservedCents"), 0);
assert.equal(await psql("select reserved_cents::text || '|' || state from public.hq_call_reservation where workspace_id = 'ws-a';"), "40|emitted_unknown");

const isolated = await reserve("ws-b", "mission-1", "caller-c", "openai", "gpt-4o-mini");
assert.equal(field(isolated, "status"), "held");
assert.equal(field(isolated, "reservedCents"), 40);
const isolatedFallback = await reserve("ws-b", "mission-1", "caller-c", "anthropic", "claude-haiku-4-5-20251001");
assert.equal(field(isolatedFallback, "status"), "held");
assert.equal(field(isolatedFallback, "reservedCents"), 80);

const notApi = await reserve("ws-b", "mission-2", "caller-c", "openai", "gpt-4o-mini", 2048, "local");
assert.equal(field(notApi, "status"), "refused");
assert.equal(field(notApi, "reason"), "access_class");

const unreliable = await reserve("ws-b", "mission-3", "caller-c", "openai", "gpt-4o");
assert.equal(field(unreliable, "status"), "refused");
assert.equal(field(unreliable, "reason"), "estimate_insufficient");

const uncovered = await reserve("ws-b", "mission-4", "caller-c", "openai", "gpt-4o-mini", 2049);
assert.equal(field(uncovered, "status"), "refused");
assert.equal(field(uncovered, "reason"), "estimate_insufficient");

const before = await psql(RESTART_SQL);
assert.equal(before, "emitted_unknown|true|40|1,held|false|40|1,held|false|80|1;2");
process.stdout.write(`BEFORE_RESTART ${before}\n`);
