// Synthetic DI fixtures only. No database or provider calls.
import path from 'node:path';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(process.cwd(), 'src'), 'server-only': path.join(process.cwd(), 'src/scripts/smoke/server-only-stub.mjs') } });
const D = await jiti.import('../atelier-development-contract.ts');
const { createDevelopmentService } = await jiti.import('../development-mission.ts');
export async function fixture() {
  const context = { workspaceId: 'workspace-a', modeId: 'hq', actorId: '11111111-1111-4111-8111-111111111111' };
  let mission;
  await createDevelopmentService({ enabled: () => true, store: () => ({ save: async m => (mission = structuredClone(m)), load: async () => null }) }).create({
    requestId: '22222222-2222-4222-8222-222222222222', title: 'Specification', objective: 'Draft one internal specification', scope: 'SPEC.md only', acceptanceCriteria: 'Reviewable artifact',
  }, context);
  mission.updatedAt = '2026-10-28T20:00:00.000Z';
  const runId = '33333333-3333-4333-8333-333333333333';
  const binding = D.buildAtelierDevelopmentBinding(mission, context, { missionId: mission.id,
    repository: { relativePath: 'project/app', baseSha: 'a'.repeat(40) },
    selection: { runtimeId: 'codex', modelId: 'gpt-fixture', catalogRevision: 'revision-fixture' }, timeoutMs: 60000 });
  mission.input._atelierRun = { version: 1, state: 'reserved', runId, reservedAt: '2026-10-28T20:00:01.000Z', binding, executionRequested: false };
  mission.updatedAt = '2026-10-28T20:00:01.000123Z';
  const request = { runId, decisionId: '44444444-4444-4444-8444-444444444444', attemptId: '55555555-5555-4555-8555-555555555555', installationId: '66666666-6666-4666-8666-666666666666' };
  return { mission, context, request };
}
export function claimed(input) {
  return { version: 1, state: 'dispatch_requested', missionId: input.payload.binding.missionId,
    workspaceId: input.context.workspaceId, actorId: input.context.actorId, runId: input.request.runId,
    decisionId: input.request.decisionId, attemptId: input.request.attemptId, installationId: input.request.installationId,
    intentId: input.intentId, bindingHash: input.payload.binding.bindingHash, payloadHash: input.payloadHash,
    requestedAt: '2026-10-28T20:01:00.000Z', consumedAt: '2026-10-28T20:01:00.000Z', ledgerId: input.request.attemptId,
    executionStarted: false, runtimeActivationAllowed: false };
}
export const ledgerDeps = { hmacKey: () => 'synthetic-test-key-not-a-secret', enabled: () => true, now: () => '2026-10-28T21:00:00.000Z' };
export const withLedgerHead = (rpc, tail = null) => ({ rpc: (name, params) => name === 'read_atelier_ledger_tail'
  ? Promise.resolve({ data: { status: 'ready', tail }, error: null }) : rpc(name, params) });
