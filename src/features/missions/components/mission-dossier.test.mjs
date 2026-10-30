import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createJiti } from 'jiti';

const dir = mkdtempSync(path.join(tmpdir(), 'mission-selector-'));
const navigation = path.join(dir, 'navigation.mjs');
writeFileSync(navigation, 'export const useRouter = () => ({ refresh() { throw Error("unexpected refresh"); } });');
const jiti = createJiti(import.meta.url, { jsx: { runtime: 'automatic' }, fsCache: false, alias: { 'next/navigation': navigation, '@': path.resolve('src') } });
const { MissionDossier } = await jiti.import('./mission-dossier.tsx');
const missions = Array.from({ length: 25 }, (_, i) => ({ id: `mission-${i}`, title: `Mission ${i}`, objective: `Objectif ${i}`, expectedOutput: 'Rapport', input: {}, status: 'draft', assignedAgentId: 'builder', updatedAt: '2026-10-30T00:00:00Z' }));
const render = props => renderToStaticMarkup(createElement(MissionDossier, { missions, source: 'local', paginated: true, ...props }));
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('mobile selector is labeled, contains every mission and preserves desktop list', () => {
  const html = render({});
  assert.match(html, /<select[^>]*class="[^"]*min-h-11/);
  assert.match(html, /Choisir une mission/);
  assert.equal((html.match(/<option /g) || []).length, 25);
  assert.match(html, /<ul class="[^"]*hidden[^"]*md:block/);
  assert.match(html, /<option value="mission-0" selected=""/);
  assert.match(html, /À préciser/);
  assert.match(html, /ne prouvent aucune exécution réelle/);
});
test('explicit requested mission is the initial selection and single dossier', () => {
  const html = render({ initialSelectedId: 'mission-24' });
  assert.match(html, /<option value="mission-24" selected=""/);
  assert.match(html, /aria-label="Dossier : Mission 24"/);
  assert.equal((html.match(/aria-label="Dossier :/g) || []).length, 1);
});
test('unknown selection safely falls back and empty results have no unusable selector', () => {
  assert.match(render({ initialSelectedId: 'unknown' }), /aria-label="Dossier : Mission 0"/);
  const empty = render({ missions: [] });
  assert.doesNotMatch(empty, /<select|<option/);
  assert.match(empty, /Aucun résultat sur cette page/);
});
test('required decision links to the exact dossier without granting approval', () => {
  const html = render({ missions: [{ ...missions[0], status: 'needs_approval', requiresApproval: true }] });
  assert.match(html, /href="\/hq\/missions\?mission=mission-0#mission-approval"/);
  assert.match(html, /Examiner la décision requise/);
});
