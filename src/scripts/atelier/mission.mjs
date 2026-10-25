#!/usr/bin/env node
// Atelier CLI (local operator). Usage:
//  create <repoPath> <modelId> <title> <need> [--runtime=codex|claude-code]
//  step <missionId> <spec|code|revision> <prompt> [--resume]
//  resume <missionId> <prompt>        (explicit resume of the same Codex session; reclaims a stale lock)
//  test <missionId> <cmd...> | preview <missionId> <file> <cmd...> | show <missionId> | list
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/__server-only-noop.js') } });
const A = await jiti.import('../../server/atelier/atelier-mission.ts');
const [cmd, ...a] = process.argv.slice(2);
const out = v => console.log(JSON.stringify(v, null, 2));
const brief = m => ({ id: m.id, status: m.status, branch: m.repo.branch, headSha: m.repo.headSha, sessionId: m.sessionId, steps: m.steps.map(s => `${s.kind}:${s.status}:${s.observedModelId ?? '-'}:${s.commitSha?.slice(0, 7) ?? '-'}`), artifacts: m.artifacts.length });
if (cmd === 'create') { const runtimeId = (a.find(x => x.startsWith('--runtime=')) ?? '--runtime=codex').slice(10); A.assertSubscriptionOnly(runtimeId); out(A.createMission({ repoPath: path.resolve(a[0]), modelId: a[1], title: a[2], need: a[3], runtimeId })); }
else if (cmd === 'step') out(brief(await A.runAgentStep(a[0], a[1], a[2], { resume: a.includes('--resume') })));
else if (cmd === 'resume') out(brief(await A.runAgentStep(a[0], null, a[1], { resume: true })));
else if (cmd === 'test') out(brief(A.runCommandStep(a[0], 'test', a.slice(1))));
else if (cmd === 'preview') out(brief(A.runCommandStep(a[0], 'preview', a.slice(2), { previewFile: a[1] })));
else if (cmd === 'show') out(A.missionView(A.loadMission(a[0])));
else if (cmd === 'list') out(A.listMissions().map(brief));
else { console.error('unknown command'); process.exit(2); }
