import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createJiti } from 'jiti';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('src') }, jsx: true });
globalThis.React = React;
const { loadAgentRunObservation } = await jiti.import('./agent-run-observation.ts');
const { AgentRunHealthPanel } = await jiti.import('./components/agent-run-health-panel.tsx');
const { projectRunsFromLedger } = await jiti.import('./workflow-run-projection.ts');
const { reduceWorkflowRuns } = await jiti.import('./workflow-run-events.ts');
const { buildRunHealthReport } = await jiti.import('./agent-run-health.ts');
const { buildAgentObservationsFromRuns } = await jiti.import('./agent-quality-from-runs.ts');
const now = Date.parse('2026-06-12T11:00:00Z');
const entries = ['decision', 'action', 'result'].map((eventType, i) => ({
 id: `e${i}`, userId:'test', actionType:eventType, eventType, summary:'Synthetic',
 autonomyLevel:1, requiresConfirmation:false, payload:{}, metadata:{}, storageMode:'supabase',
 missionId:'m1', agentId:'joris', createdAt:`2026-06-12T10:0${i}:00.000Z`,
}));
const ledger = (entries=[], source='supabase') => async () => ({workspaceId:'test', entries, source});
const missions = async () => ({workspaceId:'test', missions:[], source:'supabase'});
const failure = async () => { throw Error('private failure detail must not render'); };
const html = observation => renderToStaticMarkup(React.createElement(AgentRunHealthPanel,{observation,agentNames:{joris:'Test'},nowMs:now}));
test('complete empty source is explicitly confirmed, not an outage', async () => {
 const o=await loadAgentRunObservation(ledger(),missions,now);
 assert.equal(o.status,'complete'); assert.equal(o.report.global.total,0);
 assert.match(html(o),/Aucun run observé dans cette source/);assert.match(html(o),/Supabase/);
});
test('ledger rejection never becomes empty activity or observed quality', async () => {
 const o=await loadAgentRunObservation(failure,missions,now);
 assert.equal(o.status,'unavailable'); assert.equal(o.report,null);assert.deepEqual(o.observations,[]);
 assert.match(html(o),/L’absence de runs ne peut pas être confirmée/);
 assert.doesNotMatch(html(o),/Aucun run observé|private failure|Succès/);
});
test('missions rejection preserves journal but suppresses definitive metrics', async () => {
 const o=await loadAgentRunObservation(ledger(entries),failure,now);
 assert.equal(o.status,'partial');assert.equal(o.entries,entries);assert.equal(o.source,'supabase');
 assert.equal(o.report,null);assert.deepEqual(o.observations,[]);
 assert.match(html(o),/3 entrée\(s\) du journal conservée/);assert.doesNotMatch(html(o),/Succès|Taux d&#x27;échec|Aucun run observé/);
});
test('local source discloses temporary scope and limit', async () => {
 const o=await loadAgentRunObservation(ledger([],'local'),missions,now);
 assert.match(html(o),/session temporaire, non persistée/); assert.match(html(o),/100 dernières entrées/);
});
test('complete activity reuses unchanged health and quality derivations', async () => {
 const o=await loadAgentRunObservation(ledger(entries),missions,now);
 const runs=reduceWorkflowRuns(projectRunsFromLedger(entries,new Map()));
 assert.deepEqual(o.report,buildRunHealthReport(runs,{nowMs:now}));
 assert.deepEqual(o.observations,buildAgentObservationsFromRuns(runs));
 assert.equal(o.report.global.success,1);assert.match(html(o),/Succès/);
});
test('synchronous reader failure still allows the other independent reader', async () => {
 let read=false;
 const o=await loadAgentRunObservation(()=>{throw Error('sync');},async()=>{read=true;return missions();},now);
 assert.ok(read);assert.equal(o.status,'unavailable');
});
test('illustrative mission fallback cannot confirm observed statuses', async () => {
 const o=await loadAgentRunObservation(ledger(entries),async()=>({...await missions(),source:'mock'}),now);
 assert.equal(o.status,'partial');assert.equal(o.report,null);
});

test('local mission reads mixing seed and drafts remain partial', async () => {
 const o=await loadAgentRunObservation(ledger(entries,'local'),async()=>({...await missions(),source:'local'}),now);
 assert.equal(o.status,'partial');assert.equal(o.entries,entries);assert.equal(o.report,null);assert.deepEqual(o.observations,[]);
 assert.match(html(o),/session temporaire/);assert.doesNotMatch(html(o),/Succès/);
});
