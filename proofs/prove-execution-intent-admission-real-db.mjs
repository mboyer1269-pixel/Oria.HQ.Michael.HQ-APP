// Disposable PostgreSQL/PostgREST qualification only. Importing does no work.
// Uses real persisted intents, producer, atomic RPC and TS store. Only the final
// dispatch port is fake; this is NOT a production-auth or external-effect proof.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { localConfig, quote, SYNTHETIC_KEY } from './prove-atelier-boundary-real-db.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runAdmissionProofs({ root, sql, db, env, args }) {
  // Defense in depth even though the owner-spec runner already fences its target.
  const config = localConfig(args?.[0], 'http://127.0.0.1:3000');
  assert.deepEqual(args, [config.pg, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']);
  assert.equal(sql('select current_database()'), config.db);
  const apply = file => sql(readFileSync(path.join(root, 'db/migrations', file), 'utf8'));
  apply('0024_agent_execution_intents.sql');
  apply('drafts/approval_decision_producer_v1.sql');
  apply('drafts/approval_decision_producer_v1_verify.sql');
  apply('drafts/execution_intent_admission_v1.sql');
  sql("set oria.allow_disposable_db_tests='on';" + readFileSync(path.join(root, 'db/migrations/drafts/execution_intent_admission_v1_verify.sql'), 'utf8'));
  // This new table did not exist when the outer runner granted fixture access.
  sql("grant select,insert,update on public.agent_execution_intents to service_role;notify pgrst,'reload schema';");
  const { createJiti } = createRequire(path.join(root, 'package.json'))('jiti');
  const jiti = createJiti(path.join(root, 'package.json'), { alias: {
    '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/scripts/smoke/server-only-stub.mjs'),
  } });
  const C = await jiti.import('@/server/agents/execution-intent-admission-contract');
  const S = await jiti.import('@/server/agents/execution-intent-admission-store');
  const O = await jiti.import('@/server/missions/atelier-owner-spec-contract');
  const { stableStringify } = await jiti.import('@/server/ledger/hash-chain-canonicalizer');
  const { verifyChain } = await jiti.import('@/server/ledger/hash-chain-verifier');
  const { toLedgerChainEntry } = await jiti.import('@/server/ledger/hash-chain-ledger-fields');
  const { dispatchAdmittedTool } = await jiti.import('@/server/runtime/admitted-tool-dispatch');
  const { listExecutionCorridors } = await jiti.import('@/server/runtime/execution-corridors');
  const corridor = listExecutionCorridors(Object.freeze({
    N8N_WEBHOOK_URL: 'http://127.0.0.1:5678/webhook/disposable-no-network',
    N8N_SECRET: 'synthetic-only', AGENT_WEBHOOK_SIGNING_SECRET: SYNTHETIC_KEY,
  })).find(c => c.guard.outcome !== 'BLOCK' && c.webhook.configuration === 'configured');
  assert.ok(corridor, 'real policy must supply an eligible corridor; no fake policy override');
  const deps = { enabled: () => true, hmacKey: () => SYNTHETIC_KEY };
  const store = () => S.createExecutionIntentAdmissionStore(db, deps);
  const params = i => ({ p_workspace_id: i.source.workspaceId, p_actor_id: i.source.actorId,
    p_intent_id: i.source.intentId, p_decision_id: i.decisionId, p_attempt_id: i.attemptId,
    p_source_json: i.sourceJson, p_payload_json: i.payloadJson });
  let ready = false;
  for (let n = 0; n < 60; n++) {
    const r = await db.rpc('check_execution_intent_admission_v1', { p_workspace_id: '', p_actor_id: null,
      p_intent_id: '', p_decision_id: null, p_attempt_id: null, p_source_json: '{}', p_payload_json: '{}' });
    if (!r.error && r.data?.status === 'invalid_request') { ready = true; break; }
    await pause(100);
  }
  assert.ok(ready, 'admission RPC schema cache did not become ready');
  const prefix = 'admission-proof-' + randomUUID();
  const fixture = async (workspaceId = prefix + '-' + randomUUID()) => {
    const actor = randomUUID(), now = new Date().toISOString();
    const intent = { workspaceId, intentId: 'intent-' + randomUUID(), agentId: corridor.agentId,
      skillId: corridor.skillId, toolName: 'n8n_webhook_trigger', autonomyLevel: corridor.evaluatedAtAutonomyLevel,
      status: 'pending', requiresCeoApproval: true, createdAt: now, updatedAt: now,
      payload: { agentId: corridor.agentId, skillId: corridor.skillId, client: 'Disposable fixture',
        email: 'fixture@example.invalid', actionType: 'proof.only', missionId: 'proof-' + randomUUID(), data: { text: 'Synthetic 界' } } };
    const input = C.buildAdmissionInput(intent, actor, randomUUID(), randomUUID());
    const row = { id: randomUUID(), workspace_id: workspaceId, created_by_user_id: actor,
      intent_id: intent.intentId, agent_id: intent.agentId, skill_id: intent.skillId, tool_name: intent.toolName,
      autonomy_level: intent.autonomyLevel, status: 'pending', payload: intent.payload,
      action_ref: null, failure_code: null, requires_ceo_approval: true, created_at: now, updated_at: now };
    sql(`insert into auth.users(id) values(${quote(actor)});insert into agent_execution_intents select(jsonb_populate_record(null::agent_execution_intents,${quote(JSON.stringify(row))}::jsonb)).*;`);
    const expires = sql("select (clock_timestamp()+interval '5 minutes')::text");
    const reply = await db.rpc('create_approval_decision', { p_workspace_id: workspaceId, p_actor_id: actor,
      p_intent_id: intent.intentId, p_request_id: input.decisionId, p_payload_hash: input.payloadHash,
      p_payload_json: input.payloadJson, p_expected_snapshot: { agentId: intent.agentId, skillId: intent.skillId,
        toolName: intent.toolName, autonomyLevel: intent.autonomyLevel, payload: intent.payload },
      p_confirmed: true, p_rationale: 'Explicit synthetic owner decision for disposable qualification only', p_expires_at: expires });
    assert.equal(reply.error, null); assert.equal(reply.data?.status, 'created');
    return { input, intent, actor, workspaceId };
  };
  // Full rows, not counters. Include the entire workspace chain to detect unexpected
  // writes to a different intent in the same workspace, as well as timestamp changes.
  const snapshot = f => JSON.parse(sql(`select jsonb_build_object(
    'intent',(select to_jsonb(i) from agent_execution_intents i where workspace_id=${quote(f.workspaceId)} and intent_id=${quote(f.intent.intentId)}),
    'decisions',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from agent_review_approval_events d where workspace_id=${quote(f.workspaceId)} and intent_id=${quote(f.intent.intentId)}),
    'ledger',(select coalesce(jsonb_agg(to_jsonb(l) order by created_at,id),'[]') from action_ledger l where workspace_id=${quote(f.workspaceId)}))`));
  // Corrupt only the persisted decision, never the canonical source/request.
  // Keep all four safety flags true and preserve 0010 AND 0033 checks. A rejected
  // human decision must be non-consumable/invalid, never status approved/consumed.
  const corruptDecisionProvenance = (f, kind) => {
    const foreign = randomUUID();
    if (kind === 'foreign-user') sql(`insert into auth.users(id) values(${quote(foreign)})`);
    const changes = {
      'foreign-user': `user_id=${quote(foreign)}::uuid`,
      'member-reviewer': "reviewer_role='member'",
      'foreign-reviewer': `reviewer_id=${quote(foreign)}`,
      'altered-scope': `approved_scope=jsonb_set(approved_scope,'{toolName}','"foreign-tool"'::jsonb)`,
      'altered-snapshot': `metadata=jsonb_set(metadata,'{intentSnapshot,toolName}','"foreign-tool"'::jsonb)`,
      'rejected-human': "human_approved=false,decision='rejected',status='invalid',consumed_at=null",
    };
    assert.ok(Object.hasOwn(changes, kind));
    sql(`update agent_review_approval_events set ${changes[kind]} where id=${quote(f.input.decisionId)}`);
    const decision = snapshot(f).decisions[0];
    for (const flag of ['ledger_required_before_execution', 'no_runtime_execution_authorized', 'no_auto_approval', 'approval_event_only']) assert.equal(decision[flag], true);
  };
  const seal = async f => {
    const tail = await db.rpc('read_atelier_ledger_tail', { p_workspace_id: f.workspaceId });
    assert.equal(tail.error, null); assert.equal(tail.data?.status, 'ready');
    return O.sealOwnerSpecRow(C.admissionLedgerRow(f.input), tail.data.tail, SYNTHETIC_KEY, new Date().toISOString());
  };
  const raw = async (f, sealed, overrides = {}) => db.rpc('admit_execution_intent_v1', { ...params(f.input), p_seal: sealed, ...overrides });
  const expectCommitted = (f, ack, before) => {
    assert.equal(ack.status, 'admitted'); const after = snapshot(f);
    assert.equal(after.intent.status, 'executing'); assert.equal(after.intent.action_ref, 'attempt:' + f.input.attemptId);
    const expectedIntent = { ...before.intent, status: 'executing', action_ref: 'attempt:' + f.input.attemptId,
      failure_code: null, updated_at: after.intent.updated_at };
    assert.deepEqual(after.intent, expectedIntent);
    assert.ok(new Date(after.intent.updated_at) >= new Date(before.intent.updated_at));
    assert.equal(after.decisions.length, 1);
    assert.deepEqual(after.decisions[0], { ...before.decisions[0], status: 'consumed', consumed_at: after.decisions[0].consumed_at });
    assert.ok(after.decisions[0].consumed_at); assert.equal(after.ledger.length, before.ledger.length + 1);
    assert.deepEqual(after.ledger.filter(l => l.id !== f.input.attemptId), before.ledger);
    const row = after.ledger.find(l => l.id === f.input.attemptId); assert.ok(row);
    assert.equal(row.entry_hash, ack.receipt.ledgerHash); assert.equal(C.admissionLedgerContentMatches(f.input, row), true);
    assert.deepEqual(verifyChain(after.ledger.map(toLedgerChainEntry), { hmacKey: SYNTHETIC_KEY }), { ok: true, count: after.ledger.length });
    return after;
  };
  let effects = 0;
  const execute = async () => { effects++; return { ok: true, data: { synthetic: true } }; };
  const results = [], failures = [];
  const step = async (name, run) => { try { await run(); results.push(name); console.log('PROVEN_ADMISSION: ' + name); }
    catch (error) { failures.push({ name, message: error.message }); console.error('FAILED_ADMISSION: ' + name + ': ' + error.stack); } };
  // A real independent psql transaction holds each lock. Always release or kill
  // it, including assertion/timeout paths, so a failed proof cannot poison others.
  const block = async (f, kind) => {
    const child = spawn('psql', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { errors += b; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 12000);
    const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => {
      clearTimeout(timer); if (code === 0) resolve(); else reject(Error(errors || 'lock holder failed')); }); }); done.catch(() => {});
    const lock = kind === 'intent' ? `select id from agent_execution_intents where intent_id=${quote(f.intent.intentId)} and workspace_id=${quote(f.workspaceId)} for update`
      : kind === 'decision' ? `select id from agent_review_approval_events where id=${quote(f.input.decisionId)} for update`
        : `select pg_advisory_xact_lock(hashtextextended(${quote('atelier-ledger:' + f.workspaceId)},0))`;
    child.stdin.write(`begin;${lock};select 'LOCK:'||pg_backend_pid();\n`);
    let match; const until = Date.now() + 4000;
    try { while (!(match = /LOCK:(\d+)/.exec(output))) { assert.ok(Date.now() < until, 'lock holder readiness timeout'); await pause(10); } }
    catch (error) { child.stdin.end('rollback;\n'); await done.catch(() => {}); throw error; }
    return { pid: Number(match[1]), release: async () => { child.stdin.end('rollback;\n'); await done; } };
  };
  const observe = async (holder, count) => {
    const until = Date.now() + 4000; let observed = 0;
    while (observed < count) {
      observed = Number(sql(`with recursive blocked(pid) as(select pid from pg_stat_activity where ${holder.pid}=any(pg_blocking_pids(pid)) union select a.pid from pg_stat_activity a join blocked b on b.pid=any(pg_blocking_pids(a.pid))) select count(distinct a.pid) from pg_stat_activity a join blocked b using(pid) where a.datname=current_database() and a.wait_event_type='Lock' and a.query like '%admit_execution_intent_v1%'`));
      assert.ok(Date.now() < until, `${count} admission waiters not observed`); if (observed < count) await pause(10);
    }
    console.log('ADMISSION_WAITERS=' + observed); return observed;
  };
  const waitExpiry = async kind => {
    const f = await fixture(), sealed = await seal(f);
    sql(`update agent_review_approval_events set expires_at=clock_timestamp()+interval '2 seconds' where id=${quote(f.input.decisionId)}`);
    const before = snapshot(f), holder = await block(f, kind), pending = raw(f, sealed); let answer;
    // Postgrest builders are lazy thenables; assimilate BEFORE observing waiters.
    const running = Promise.resolve(pending);
    try {
      await observe(holder, 1); assert.deepEqual(snapshot(f), before);
      const until = Date.now() + 4500;
      while (sql(`select expires_at<=clock_timestamp() from agent_review_approval_events where id=${quote(f.input.decisionId)}`) !== 't') {
        assert.ok(Date.now() < until, 'expiry wait timeout'); await pause(20);
      }
    } finally { await holder.release(); answer = await running; }
    assert.equal(answer.error, null); assert.equal(answer.data?.status, 'approval_required');
    assert.deepEqual(snapshot(f), before);
  };

  await step('fresh ACK, exact current ledger and one-use real-policy fake dispatch', async () => {
    const f = await fixture(), s = store(), before = snapshot(f), n = effects, ack = await s.admit(f.input);
    expectCommitted(f, ack, before);
    const current = await db.rpc('check_execution_intent_admission_v1', params(f.input));
    assert.equal(current.error, null); assert.equal(current.data?.status, 'current'); assert.deepEqual(current.data.receipt, ack.receipt);
    assert.deepEqual(current.data.ledger, snapshot(f).ledger[0]);
    assert.equal((await dispatchAdmittedTool(f.input, ack.receipt, s, execute)).ok, true);
    assert.equal(effects, n + 1); assert.equal(await s.takeCurrent(f.input, ack.receipt), false);
    assert.equal((await dispatchAdmittedTool(f.input, ack.receipt, s, execute)).ok, false); assert.equal(effects, n + 1);
    const committed = snapshot(f); assert.equal((await s.admit(f.input)).status, 'conflict'); assert.deepEqual(snapshot(f), committed);
  });
  await step('expired deadline, revoked decision and historical pending attempt refuse without effects', async () => {
    for (const mutation of ["expires_at=clock_timestamp()-interval '1 second'", 'expires_at=clock_timestamp()', "revoked_at=clock_timestamp(),status='revoked'"]) {
      const f = await fixture(); sql(`update agent_review_approval_events set ${mutation} where id=${quote(f.input.decisionId)}`);
      const before = snapshot(f); assert.equal((await store().admit(f.input)).status, 'approval_required'); assert.deepEqual(snapshot(f), before);
    }
    for (const ref of ['', 'attempt:' + randomUUID()]) {
      const f = await fixture(); sql(`update agent_execution_intents set action_ref=${quote(ref)} where intent_id=${quote(f.intent.intentId)}`);
      const before = snapshot(f); assert.equal((await store().admit(f.input)).status, 'conflict'); assert.deepEqual(snapshot(f), before);
    }
  });
  await step('expiry after observed intent-row wait has zero mutation', async () => { await waitExpiry('intent'); });
  await step('expiry after observed workspace-ledger mutex wait has zero mutation', async () => { await waitExpiry('mutex'); });
  await step('expiry after observed decision-row wait has zero mutation', async () => { await waitExpiry('decision'); });
  await step('two observed intent waiters produce one admission and one fake dispatch', async () => {
    const f = await fixture(), a = store(), b = store(), before = snapshot(f), n = effects, holder = await block(f, 'intent');
    const pending = Promise.all([a.admit(f.input), b.admit(f.input)]); let answers;
    try { await observe(holder, 2); assert.deepEqual(snapshot(f), before); }
    finally { await holder.release(); answers = await pending; }
    assert.equal(answers.filter(x => x.status === 'admitted').length, 1); assert.equal(answers.filter(x => x.status === 'conflict').length, 1);
    const index = answers.findIndex(x => x.status === 'admitted'); expectCommitted(f, answers[index], before);
    assert.equal((await dispatchAdmittedTool(f.input, answers[index].receipt, [a, b][index], execute)).ok, true); assert.equal(effects, n + 1);
  });
  await step('failures after consume, append and claim roll back every full row', async () => {
    for (const phase of ['consumed', 'append', 'claim']) {
      const f = await fixture(), before = snapshot(f), table = phase === 'consumed' ? 'agent_review_approval_events' : phase === 'append' ? 'action_ledger' : 'agent_execution_intents';
      const event = phase === 'append' ? 'insert' : 'update';
      const condition = phase === 'consumed' ? `new.id=${quote(f.input.decisionId)}::uuid and new.status='consumed'`
        : phase === 'append' ? `new.id=${quote(f.input.attemptId)}::uuid` : `new.intent_id=${quote(f.intent.intentId)} and new.status='executing'`;
      const marker = { consumed: 'observed_consumed_rollback', append: 'observed_append_rollback', claim: 'observed_claim_rollback' }[phase];
      sql(`begin;create function public.admission_proof_fail() returns trigger language plpgsql as $$begin
        if ${condition} then
          if not exists(select 1 from agent_review_approval_events where id=${quote(f.input.decisionId)} and status='consumed' and consumed_at is not null) then raise exception 'wrong_injection_phase';end if;
          ${phase !== 'consumed' ? `if not exists(select 1 from action_ledger where id=${quote(f.input.attemptId)}) then raise exception 'wrong_injection_phase';end if;` : ''}
          raise exception '${marker}';end if;return new;end$$;
        create trigger admission_proof_fail after ${event} on ${table} for each row execute function admission_proof_fail();commit;`);
      try { const reply = await raw(f, await seal(f)); assert.ok(reply.error); assert.ok(reply.error.message.includes(marker), reply.error.message); assert.deepEqual(snapshot(f), before); }
      finally { sql(`drop trigger admission_proof_fail on ${table};drop function public.admission_proof_fail();`); }
    }
  });
  await step('foreign scope and every exact source field refuse without writes', async () => {
    const f = await fixture(), sealed = await seal(f), before = snapshot(f);
    const changes = [{ p_actor_id: randomUUID() }, { p_workspace_id: prefix + '-foreign' }, { p_intent_id: 'foreign' },
      ...Object.keys(f.input.source).map(key => ({ p_source_json: stableStringify({ ...f.input.source,
        [key]: key === 'payload' ? { ...f.input.source.payload, extra: true } : key === 'requiresCeoApproval' ? false : key === 'autonomyLevel' ? 5 : 'foreign' }) })),
      { p_payload_json: stableStringify({ ...f.input.source.payload, extra: true }) }];
    for (const change of changes) { const r = await raw(f, sealed, change); assert.equal(r.error, null); assert.ok(['not_found', 'conflict', 'approval_required'].includes(r.data?.status)); assert.deepEqual(snapshot(f), before); }
    for (const kind of ['foreign-user', 'member-reviewer', 'foreign-reviewer', 'altered-scope', 'altered-snapshot', 'rejected-human']) {
      const f = await fixture(), sealed = await seal(f), canonicalParams = params(f.input), noEffects = effects;
      corruptDecisionProvenance(f, kind);
      const before = snapshot(f);
      const provenance = await db.rpc('classify_approval_decision', { p_workspace_id: f.workspaceId,
        p_actor_id: f.actor, p_intent_id: f.intent.intentId, p_request_id: f.input.decisionId, p_payload_hash: f.input.payloadHash });
      assert.equal(provenance.error, null);
      assert.equal(provenance.data?.state, kind === 'foreign-user' ? 'missing' : 'invalid');
      const refused = await raw(f, sealed);
      assert.equal(refused.error, null); assert.equal(refused.data?.status, 'approval_required');
      assert.deepEqual(params(f.input), canonicalParams); assert.deepEqual(snapshot(f), before); assert.equal(effects, noEffects);
    }
  });
  await step('lost or malformed real commit ACK never dispatches or rearms on replay', async () => {
    for (const kind of ['lost', 'malformed']) {
      const f = await fixture(), before = snapshot(f), n = effects; let captured, mutations = 0;
      const faultDb = { rpc: async (name, p) => { const out = await db.rpc(name, p); if (name !== 'admit_execution_intent_v1') return out;
        mutations++; assert.equal(out.error, null); assert.equal(out.data?.status, 'admitted'); captured = out.data;
        return kind === 'lost' ? { data: null, error: Error('synthetic lost ACK after real commit') } : { data: { status: 'admitted', receipt: {} }, error: null }; } };
      const s = S.createExecutionIntentAdmissionStore(faultDb, deps); assert.equal((await s.admit(f.input)).status, 'unconfirmed');
      expectCommitted(f, captured, before); assert.equal(mutations, 1);
      assert.equal((await dispatchAdmittedTool(f.input, captured.receipt, s, execute)).ok, false);
      const restarted = store(); assert.equal(await restarted.takeCurrent(f.input, captured.receipt), false);
      const committed = snapshot(f); assert.equal((await restarted.admit(f.input)).status, 'conflict');
      assert.deepEqual(snapshot(f), committed); assert.equal(effects, n);
    }
  });
  await step('fresh ticket current-check refuses revocation, expiry and source drift', async () => {
    for (const kind of ['revoked', 'expired', 'source']) {
      const f = await fixture(), s = store(), ack = await s.admit(f.input), n = effects; assert.equal(ack.status, 'admitted');
      if (kind === 'source') sql(`update agent_execution_intents set payload=payload||'{"extra":true}'::jsonb where intent_id=${quote(f.intent.intentId)}`);
      else sql(`update agent_review_approval_events set ${kind === 'revoked' ? 'revoked_at=clock_timestamp()' : "expires_at=clock_timestamp()-interval '1 second'"} where id=${quote(f.input.decisionId)}`);
      const before = snapshot(f); assert.equal((await dispatchAdmittedTool(f.input, ack.receipt, s, execute)).ok, false);
      assert.equal(await s.takeCurrent(f.input, ack.receipt), false); assert.equal(effects, n); assert.deepEqual(snapshot(f), before);
    }
    for (const kind of ['altered-scope', 'foreign-reviewer', 'altered-snapshot']) {
      const f = await fixture(), s = store(), ack = await s.admit(f.input), canonicalParams = params(f.input), noEffects = effects;
      assert.equal(ack.status, 'admitted');
      corruptDecisionProvenance(f, kind);
      const before = snapshot(f), current = await db.rpc('check_execution_intent_admission_v1', params(f.input));
      assert.equal(current.error, null); assert.equal(current.data?.status, 'approval_required');
      // A raw observation never consumes the store's process-local fresh ACK.
      // The first actual dispatch must independently refuse that original ticket.
      assert.equal((await dispatchAdmittedTool(f.input, ack.receipt, s, execute)).ok, false);
      assert.equal(await s.takeCurrent(f.input, ack.receipt), false);
      assert.deepEqual(params(f.input), canonicalParams); assert.deepEqual(snapshot(f), before); assert.equal(effects, noEffects);
    }
  });
  await step('nonempty chain and real unique-index collision roll back consume and claim', async () => {
    const first = await fixture(), initial = snapshot(first), ack = await store().admit(first.input); expectCommitted(first, ack, initial);
    const second = await fixture(first.workspaceId), beforeSecond = snapshot(second), secondAck = await store().admit(second.input);
    expectCommitted(second, secondAck, beforeSecond);
    const f = await fixture(first.workspaceId), before = snapshot(f);
    // Simulate a noncooperating writer by forcing an already-used predecessor in
    // a disposable BEFORE INSERT trigger. The actual unique index must reject it.
    sql(`begin;create function public.admission_proof_collision() returns trigger language plpgsql as $$begin
      if new.id=${quote(f.input.attemptId)}::uuid then new.prev_hash=${quote(ack.receipt.ledgerHash)};end if;return new;end$$;
      create trigger admission_proof_collision before insert on action_ledger for each row execute function admission_proof_collision();commit;`);
    try { const r = await raw(f, await seal(f)); assert.ok(r.error); assert.ok(r.error.message.includes('action_ledger_prev_hash_unique'), r.error.message); assert.deepEqual(snapshot(f), before); }
    finally { sql('drop trigger admission_proof_collision on action_ledger;drop function public.admission_proof_collision();'); }
  });
  await step('anon and authenticated denied, narrow revert preserves all persisted facts', async () => {
    for (const role of ['anon', 'authenticated']) for (const call of [
      "admit_execution_intent_v1('x',null,'x',null,null,'{}','{}','{}')",
      "check_execution_intent_admission_v1('x',null,'x',null,null,'{}','{}')",
    ]) { const r = spawnSync('psql', args, { input: `set role ${role};select public.${call};`, encoding: 'utf8', env, timeout: 12000 });
      assert.notEqual(r.status, 0); assert.match(r.stderr, /permission denied/); }
    const allFacts = () => JSON.parse(sql(`select jsonb_build_object('intents',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from agent_execution_intents i),
      'decisions',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from agent_review_approval_events d),
      'ledger',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from action_ledger l))`));
    const before = allFacts(); apply('drafts/execution_intent_admission_v1_revert.sql'); assert.deepEqual(allFacts(), before);
    assert.equal(sql("select to_regprocedure('public.admit_execution_intent_v1(text,uuid,text,uuid,uuid,text,text,jsonb)') is null and to_regprocedure('public.check_execution_intent_admission_v1(text,uuid,text,uuid,uuid,text,text)') is null"), 't');
  });
  console.log(JSON.stringify({ admissionProofsPassed: results.length, failures, fakeDispatches: effects }));
  assert.deepEqual(failures, []); assert.equal(results.length, 12);
  console.log('ALL 12 EXECUTION-INTENT ADMISSION REAL-DB PROOFS PASSED');
  return { proofsPassed: results.length, fakeDispatches: effects };
}
