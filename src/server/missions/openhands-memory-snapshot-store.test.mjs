import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(process.cwd(), 'src'),
  'server-only': path.join(process.cwd(), 'src/scripts/smoke/server-only-stub.mjs') } });
const { prepareOpenHandsMemoryContext, validateOpenHandsMemorySnapshot } = await jiti.import('./openhands-memory-context.ts');
const { createOpenHandsMemorySnapshotStore } = await jiti.import('./openhands-memory-snapshot-store.ts');
const scope = { workspaceId: 'workspace-a', projectId: 'project-a', actorId: 'owner',
  missionId: '714ac9b7-6bce-4eb4-b3bd-08d3df8ad46e', missionVersion: '2026-09-30T12:00:00.000Z' };
async function snapshot(name = 'First decision', time = scope.missionVersion) {
  const entity = { id: 'anchor', namespace: 'org:project-a', type: 'Project', name,
    source: 'reviewed', properties: { status: 'verified' } };
  const result = await prepareOpenHandsMemoryContext({ ...scope,
    resolveProjectBinding: async () => ({ workspaceId: scope.workspaceId, projectId: scope.projectId,
      namespace: entity.namespace, namespaceScope: 'project', centerEntityId: entity.id }),
    transport: { listTools: async () => ['agentmemory_context_pack'], close: async () => {},
      callTool: async () => JSON.stringify({ graphContext: { namespace: entity.namespace, tenant: entity.namespace,
        centerEntity: entity, entities: [entity], relations: [] }, provenance: [{ id: entity.id, source: entity.source }] }) },
    now: () => new Date(time),
  });
  assert.equal(result.status, 'ready');
  return result.snapshot;
}
function database() {
  const rows = new Map(); let failRead = false; let writes = 0;
  const client = createClient('https://synthetic.invalid', 'synthetic-key', {
    auth: { persistSession: false }, global: { fetch: async (url, init) => {
      const u = new URL(url);
      if (init.method === 'POST') {
        writes++;
        assert.match(new Headers(init.headers).get('prefer'), /resolution=ignore-duplicates/);
        const row = JSON.parse(init.body);
        if (!rows.has(row.id)) rows.set(row.id, row);
        return new Response(null, { status: 201 });
      }
      if (failRead) { failRead = false; return new Response('{"message":"unavailable"}', { status: 500 }); }
      const row = rows.get(u.searchParams.get('id').slice(3));
      return new Response(JSON.stringify(row ?? null), { headers: { 'content-type': 'application/json' } });
    } },
  });
  return { store: createOpenHandsMemorySnapshotStore(client), rows, writes: () => writes,
    failNextRead: () => { failRead = true; } };
}
test('canonical snapshot survives changed memory/time and concurrent preparation', async () => {
  const db = database(); const first = await snapshot(); const later = await snapshot('Changed decision', '2026-09-30T12:01:00.000Z');
  const results = await Promise.all([db.store.persist(scope, first), db.store.persist(scope, later)]);
  assert.deepEqual(results[0], results[1]); assert.equal(db.rows.size, 1);
  assert.ok([first.snapshotHash, later.snapshotHash].includes(results[0].snapshotHash));
  assert.deepEqual(await db.store.load(scope), results[0]);
  assert.ok(Object.isFrozen(results[0]));
});
test('new mission version captures fresh memory; actor and project cannot reuse another scope', async () => {
  const db = database(); await db.store.persist(scope, await snapshot());
  assert.equal(await db.store.load({ ...scope, actorId: 'other' }), null);
  assert.equal(await db.store.load({ ...scope, projectId: 'other' }), null);
  const later = await snapshot('Next revision');
  assert.deepEqual(await db.store.persist({ ...scope, missionVersion: '2026-10-01T00:00:00.000Z' }, later), later);
  assert.equal(db.rows.size, 2);
});
test('lost canonical read is unknown; retry recovers the original committed snapshot', async () => {
  const db = database(); const first = await snapshot(); db.failNextRead();
  await assert.rejects(db.store.persist(scope, first), /read_unavailable/);
  assert.equal(db.rows.size, 1);
  assert.deepEqual(await db.store.persist(scope, await snapshot('Changed while disconnected')), first);
});
test('corrupted snapshot, scope, or ledger metadata fails closed', async () => {
  const db = database(); const first = await snapshot();
  for (const patch of [{ content: first.content.replace('First decision', 'Injected') },
    { contentChars: 1 }, { retrievedAtIso: 'invalid' }, { unknown: true }, { workspaceId: 'foreign' }]) {
    assert.equal(validateOpenHandsMemorySnapshot({ ...first, ...patch }), null);
    await assert.rejects(db.store.persist(scope, { ...first, ...patch }));
  }
  assert.equal(db.writes(), 0);
  await db.store.persist(scope, first);
  const row = [...db.rows.values()][0]; row.metadata.scope.missionVersion = '2020-01-01T00:00:00.000Z';
  await assert.rejects(db.store.load(scope), /integrity_conflict/);
});
