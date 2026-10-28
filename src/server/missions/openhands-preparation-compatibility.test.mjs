import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createJiti} from 'jiti';

const root = path.resolve(import.meta.dirname, '../../..');
const jiti = createJiti(import.meta.url, {alias: {
  '@': path.join(root, 'src'),
  'server-only': path.join(root, 'src/scripts/smoke/server-only-stub.mjs'),
}});
const {createDevelopmentService} = await jiti.import('./development-mission.ts');
const {buildOpenHandsSubmission} = await jiti.import('./openhands-submission.ts');
const {createOpenHandsConfirmationService} = await jiti.import('./openhands-confirmation.ts');
const {requestOpenHands} = await jiti.import('../../features/missions/openhands-preparation.ts');
const context = {workspaceId: 'compatibility-fixture', actorId: 'fixture-owner'};
const now = Date.parse('2026-10-23T12:00:00Z');
let original;
await createDevelopmentService({enabled: () => true, store: () => ({
  save: async mission => {original = mission; return mission;}, load: async () => original,
})}).create({requestId: '714ac9b7-6bce-4eb4-b3bd-08d3df8ad46e', title: 'Contract compatibility',
  objective: 'Refuse unsupported execution contracts', scope: 'One local contract',
  acceptanceCriteria: 'No authority or reservation for unsupported contracts'},
{...context, modeId: 'hq'});
assert.ok(original);
const request = {missionId: original.id, expectedUpdatedAt: original.updatedAt,
  commitSha: 'a'.repeat(40), executorVersion: '1.2.3',
  budget: {maxCostCents: 10, maxTokens: 100, maxIterations: 1, timeoutSeconds: 60}};

// Same canonical snapshot format as the existing confirmation integration test.
// This is synthetic provenance, not a Memex connection or independently verified fact.
const entity = {id: 'anchor', namespace: 'org:compatibility-project', type: 'Project',
  source: 'fixture-review', properties: {status: 'verified'}};
const content = JSON.stringify({centerEntity: entity, entities: [entity], relations: [],
  provenance: [{id: entity.id, source: entity.source, originId: null, confidence: null}]});
const hashInput = {contractVersion: 1, sourceTool: 'agentmemory_context_pack',
  workspaceId: context.workspaceId, projectId: 'compatibility-project', namespace: entity.namespace,
  centerEntityId: entity.id, retrievedAtIso: new Date(now).toISOString(), content, redactionsApplied: 0};
const memory = {...hashInput, contentChars: content.length,
  snapshotHash: createHash('sha256').update(JSON.stringify(hashInput)).digest('hex')};
const missionFor = withMemory => withMemory
  ? {...structuredClone(original), input: {...original.input, _openhandsMemory: structuredClone(memory)}}
  : structuredClone(original);
const packet = dossier => ({version: 1, workspaceId: context.workspaceId,
  request: structuredClone(request), expectedPayloadHash: dossier.payloadHash});
const uiPrepare = dossier => requestOpenHands('prepare', packet(dossier), async () =>
  Response.json({status: 'prepared', dossier, externalEffectAllowed: false}));

function confirmationFixture(mission, configuration = null) {
  const effects = {authorityPersist: 0, cas: 0, audit: 0};
  let row = structuredClone(mission);
  const service = createOpenHandsConfirmationService({configuration: () => configuration, now: () => now,
    store: () => ({load: async () => structuredClone(row),
      compareAndSwap: async (_before, receipt) => {
        effects.cas++;
        row = {...row, input: {...row.input, _openhandsReservation: receipt}};
        return structuredClone(row);
      }, audit: async () => {effects.audit++; return 'fixture-audit';}}),
    authority: () => ({persist: async (dossier, actorId) => {
      effects.authorityPersist++;
      return {version: 1, id: '33333333-3333-4333-8333-333333333333', scope: 'openhands.submission',
        workspaceId: dossier.mission.workspaceId, missionId: dossier.mission.id,
        missionVersion: dossier.mission.version, idempotencyKey: dossier.idempotencyKey,
        payloadHash: dossier.payloadHash, actorId, approvedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 600000).toISOString()};
    }}),
  });
  return {service, effects};
}
const assertNoEffects = effects => assert.deepEqual(effects, {authorityPersist: 0, cas: 0, audit: 0});

for (const withMemory of [false, true]) {
  const legacyVersion = withMemory ? 2 : 1;
  test(`real v${legacyVersion} producer remains preparable and UI preserves exact reviewed fields`, async () => {
    const mission = missionFor(withMemory);
    const built = buildOpenHandsSubmission(mission, context.workspaceId, request);
    assert.equal(built.status, 'prepared');
    const dossier = built.dossier;
    assert.equal(dossier.contractVersion, legacyVersion);
    assert.equal(Object.hasOwn(dossier, 'foundationModelId'), false);
    assert.equal(dossier.executionRequested, false);
    assert.equal(dossier.approvalRequired, true);
    const fixture = confirmationFixture(mission);
    const preview = await fixture.service(context, request);
    assert.equal(preview.status, 'prepared');
    assert.deepEqual(preview.dossier, dossier);
    assertNoEffects(fixture.effects);
    const ui = await uiPrepare(dossier);
    assert.equal(ui.kind, 'prepared');
    assert.deepEqual(ui.dossier, dossier);
    assert.ok(Object.isFrozen(ui.dossier));
    assert.ok(Object.isFrozen(ui.dossier.budget));
    if (withMemory) assert.deepEqual(ui.dossier.memory, memory);
    const changed = buildOpenHandsSubmission(mission, context.workspaceId,
      {...request, budget: {...request.budget, maxTokens: 101}}).dossier;
    assert.notEqual(changed.payloadHash, dossier.payloadHash);
    const stale = await fixture.service(context, request, {confirm: true, expectedPayloadHash: changed.payloadHash});
    assert.equal(stale.status, 'dossier_changed');
    assertNoEffects(fixture.effects);
    for (const mutation of [
      {...dossier, foundationModelId: 'default'},
      {...dossier, foundationModelId: 'unlisted-fixture-999'},
      {...dossier, mission: {...dossier.mission, workspaceId: 'foreign'}},
      {...dossier, budget: {...dossier.budget, maxTokens: 101}},
      {...dossier, payloadHash: 'invalid-hash'},
      {...dossier, unexpectedField: true},
    ]) assert.equal((await uiPrepare(mutation)).kind, 'blocked');
  });

  for (const model of ['claude-fixture-1', 'default', 'unlisted-fixture-999']) {
    test(`v3 model ${model}, memory=${withMemory}: producer exact, prepare and confirm refuse before effects`, async (t) => {
      const mission = missionFor(withMemory);
      const nativeRequest = {...request, foundationModelId: model};
      const built = buildOpenHandsSubmission(mission, context.workspaceId, nativeRequest);
      assert.equal(built.status, 'prepared');
      assert.equal(built.dossier.contractVersion, 3);
      assert.equal(built.dossier.foundationModelId, model);
      assert.deepEqual(built.dossier.memory, withMemory ? memory : undefined);
      const changed = buildOpenHandsSubmission(mission, context.workspaceId,
        {...nativeRequest, foundationModelId: 'different-fixture-2'}).dossier;
      assert.notEqual(built.dossier.payloadHash, changed.payloadHash);
      assert.equal(built.dossier.idempotencyKey, changed.idempotencyKey);
      for (const confirmation of [undefined, {confirm: true, expectedPayloadHash: built.dossier.payloadHash}]) {
        await t.test(confirmation ? 'confirm' : 'prepare', async () => {
          const fixture = confirmationFixture(mission);
          const outcome = await fixture.service(context, nativeRequest, confirmation);
          assertNoEffects(fixture.effects);
          assert.equal(outcome.status, 'unsupported_execution_contract');
          assert.equal(outcome.externalEffectAllowed, false);
        });
      }
    });
    test(`v3 model ${model}, memory=${withMemory}: legacy prepared response is blocked with explicit model explanation`, async () => {
      const dossier = buildOpenHandsSubmission(missionFor(withMemory), context.workspaceId,
        {...request, foundationModelId: model}).dossier;
      const result = await uiPrepare(dossier);
      assert.equal(result.kind, 'blocked');
      assert.match(result.message, /mod[eè]le/i);
    });
  }
}

test('v2 memory binding and integrity remain enforced by real producer and UI', async () => {
  const mission = missionFor(true);
  const dossier = buildOpenHandsSubmission(mission, context.workspaceId, request).dossier;
  for (const patch of [{workspaceId: 'foreign'}, {content: 'altered'}, {snapshotHash: '0'.repeat(64)}]) {
    const corrupt = {...mission, input: {...mission.input, _openhandsMemory: {...memory, ...patch}}};
    assert.equal(buildOpenHandsSubmission(corrupt, context.workspaceId, request).status, 'ineligible_mission');
  }
  for (const changed of [{...dossier, memory: undefined},
    {...dossier, memory: {...memory, workspaceId: 'foreign'}},
    {...dossier, memory: {...memory, contentChars: 1}}])
    assert.equal((await uiPrepare(changed)).kind, 'blocked');
});

test('v3 missing or malformed model never becomes a prepared UI dossier', async () => {
  const built = buildOpenHandsSubmission(original, context.workspaceId,
    {...request, foundationModelId: 'claude-fixture-1'}).dossier;
  for (const model of [undefined, '', ' model-4', 'model-4\n']) {
    const altered = {...built, foundationModelId: model};
    if (model === undefined) delete altered.foundationModelId;
    assert.equal((await uiPrepare(altered)).kind, 'blocked');
    if (model !== undefined) assert.equal(buildOpenHandsSubmission(original, context.workspaceId,
      {...request, foundationModelId: model}).status, 'invalid_request');
  }
});

test('explicit unsupported server response blocks both UI actions with a model explanation', async () => {
  const dossier = buildOpenHandsSubmission(original, context.workspaceId, request).dossier;
  for (const action of ['prepare', 'confirm']) {
    let calls = 0;
    const result = await requestOpenHands(action, packet(dossier), async () => {
      calls++;
      return Response.json({status: 'unsupported_execution_contract', externalEffectAllowed: false}, {status: 409});
    });
    assert.equal(calls, 1);
    assert.equal(result.kind, 'blocked');
    assert.match(result.message, /mod[eè]le/i);
  }
});

test('server-configured model cannot bypass compatibility refusal; selection guards remain distinct', async (t) => {
  const configuration = {
    imageDigest: 'sha256:' + 'd'.repeat(64), executorVersion: request.executorVersion,
    runnerId: 'fixture-runner', permissionPolicy: 'deny', ...request.budget,
    hardTokenLimitEnforced: false, foundationModelId: 'default',
    providerProfile: {id: 'fixture-profile', policySha256: 'e'.repeat(64), provider: 'claude',
      authentication: 'subscription', network: 'restricted-proxy', accountConnectors: 'disabled'},
  };
  const {foundationModelId: _omitted, ...withoutModel} = configuration;
  for (const withMemory of [false, true]) {
    const mission = missionFor(withMemory);
    const configuredDossier = buildOpenHandsSubmission(mission, context.workspaceId,
      {...request, foundationModelId: configuration.foundationModelId}).dossier;
    const cases = [
      {label: 'configured model injected into model-free request', config: configuration,
        input: request, expected: 'unsupported_execution_contract'},
      {label: 'configured profile without selected model', config: withoutModel,
        input: request, expected: 'model_selection_required'},
      {label: 'request model differs from server selection', config: configuration,
        input: {...request, foundationModelId: 'different-fixture-2'}, expected: 'model_selection_changed'},
    ];
    for (const scenario of cases) {
      for (const confirm of [false, true]) {
        await t.test(`${scenario.label}; memory=${withMemory}; confirm=${confirm}`, async () => {
          const fixture = confirmationFixture(mission, scenario.config);
          const result = await fixture.service(context, scenario.input, confirm
            ? {confirm: true, expectedPayloadHash: configuredDossier.payloadHash} : undefined);
          assertNoEffects(fixture.effects);
          assert.equal(result.status, scenario.expected);
          assert.equal(result.externalEffectAllowed, false);
        });
      }
    }
  }
});

test('UI rejects unknown dossier versions and memory smuggled into v1', async () => {
  const legacy = buildOpenHandsSubmission(original, context.workspaceId, request).dossier;
  const memoryDossier = buildOpenHandsSubmission(missionFor(true), context.workspaceId, request).dossier;
  for (const dossier of [
    {...legacy, contractVersion: 4},
    {...memoryDossier, contractVersion: 4},
    {...legacy, memory: structuredClone(memory)},
  ]) assert.equal((await uiPrepare(dossier)).kind, 'blocked');
});

test('existing v3 reservations remain reconciliation cases, never fresh compatibility refusals', async (t) => {
  for (const state of ['reserved', 'audit_recorded', 'outcome_unknown']) {
    for (const confirm of [false, true]) {
      await t.test(`${state}; confirm=${confirm}`, async () => {
        const mission = missionFor(true);
        const nativeRequest = {...request, foundationModelId: 'default'};
        const dossier = buildOpenHandsSubmission(mission, context.workspaceId, nativeRequest).dossier;
        assert.equal(dossier.contractVersion, 3);
        const receipt = {
          version: 1, reservationId: '22222222-2222-4222-8222-222222222222', state,
          workspaceId: context.workspaceId, missionId: mission.id, missionVersion: mission.updatedAt,
          idempotencyKey: dossier.idempotencyKey, payloadHash: dossier.payloadHash,
          authorizationId: '33333333-3333-4333-8333-333333333333', actorId: context.actorId,
          reservedAt: new Date(now).toISOString(), authorizationExpiresAt: new Date(now + 600000).toISOString(),
          ...(state === 'audit_recorded' ? {auditId: 'existing-fixture-audit'} : {}),
        };
        mission.input._openhandsReservation = structuredClone(receipt);
        const before = structuredClone(mission);
        const effects = {authorityPersist: 0, cas: 0, audit: 0};
        // Return the actual stored object to detect mutations as well as explicit writes.
        const service = createOpenHandsConfirmationService({configuration: () => null, now: () => now,
          store: () => ({load: async () => mission,
            compareAndSwap: async () => {effects.cas++; return null;},
            audit: async () => {effects.audit++; return 'unexpected-audit';}}),
          authority: () => ({persist: async () => {effects.authorityPersist++; throw Error('unexpected authority');}}),
        });
        const result = await service(context, nativeRequest, confirm
          ? {confirm: true, expectedPayloadHash: dossier.payloadHash} : undefined);
        assertNoEffects(effects);
        assert.equal(result.status, 'reconciliation_required');
        assert.equal(result.externalEffectAllowed, false);
        assert.deepEqual(mission, before, 'existing receipt and memory must remain untouched');
        assert.deepEqual(mission.input._openhandsReservation, receipt);
        assert.equal(mission.input._openhandsReservation.payloadHash, dossier.payloadHash);
        assert.notEqual(dossier.payloadHash,
          buildOpenHandsSubmission(missionFor(true), context.workspaceId, request).dossier.payloadHash,
          'the receipt stays bound to v3, never silently downgraded to the v2 memory dossier');
      });
    }
  }
});
