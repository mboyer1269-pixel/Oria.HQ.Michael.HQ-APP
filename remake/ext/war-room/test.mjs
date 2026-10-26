// Test Playwright : clique chaque bouton visible, vérifie une réponse visible (#status change), puis axe.
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';
import AxeBuilder from '/tmp/pw/node_modules/@axe-core/playwright/dist/index.mjs';
import { fileURLToPath } from 'url'; import path from 'path'; import fs from 'fs';
const dir = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(dir, 'index.html');
const out = path.join(dir, 'preuves'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let fails = 0, clicks = 0; const report = [];
for (const [name, vp] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, ...(name === '390' ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000); page.on('pageerror', e => { fails++; report.push(`[${name}] JS: ${e.message}`); });
  await page.goto(url);
  var views = (process.env.VIEWS || 'appr,mis,cost,dash,atl,riso').split(',');
  for (const v of views) {
    await page.click(`#nav-${v}`); console.log("view",name,v,Date.now()%1e6);
    // scénario complet atelier : plan -> étapes -> PR
    const seen = new Set();
    for (let pass = 0; pass < 6; pass++) {
      const ids = await page.$$eval(`#v-${v} button, #v-${v} input[type=checkbox], nav.top button`, bs => bs.filter(b => b.id && b.checkVisibility({visibilityProperty:true})).map(b => b.id));
      for (const id of ids) {
        if (seen.has(id) || id.startsWith('nav-')) continue; seen.add(id);
        const loc = page.locator('#' + id); if (!(await loc.isVisible())) continue;
        const inSide = await page.evaluate(i => !!document.querySelector('#side').contains(document.getElementById(i)), id);
        if (!inSide && await page.evaluate(() => document.querySelector('#side').classList.contains('open'))) { await page.click('#closeSide'); await page.waitForTimeout(250); }
        if (inSide && name==='390' && !(await page.evaluate(() => document.querySelector('#side').classList.contains('open')))) { await page.click('#ms-hist'); await page.waitForTimeout(250); }
        if (process.env.DBG) console.log("click", id);
        const before = await page.getAttribute('#status', 'data-count');
        if ((await loc.getAttribute('aria-disabled')) === 'true' || id.startsWith('lk')) { await loc.scrollIntoViewIfNeeded(); await loc.dispatchEvent('click'); } else { try { await loc.click({ timeout: 4000 }); } catch { report.push(`[${name}/${v}] note : #${id} recouvert pendant un changement de mise en page, clic par événement`); await loc.dispatchEvent('click'); } } clicks++;
        try { await page.waitForFunction(b => document.querySelector('#status').dataset.count !== b, before, { timeout: 2500 }); }
        catch { fails++; report.push(`[${name}/${v}] pas de réponse visible : #${id}`); console.log("FAIL",name,v,id); continue; }
        if (!(await page.isVisible('#status'))) { fails++; report.push(`[${name}/${v}] statut invisible après #${id}`); }
        if (id === 'runStep') await page.waitForTimeout(1900);
        if (id === 'misStop') await page.waitForTimeout(2800);
        if (await page.isVisible('#side.open') && id !== 'ms-hist') {} // tiroir géré par ses propres boutons
        if (!(await page.locator(`#v-${v}`).isVisible())) await page.click(`#nav-${v}`);
        if (v==='dash' && name==='390' && id==='ms-hist') { /* tiroir ouvert : on teste ses boutons */ }
      }
      if (v === 'cost' && pass === 0) seen.delete('bnQuota');
      if (v === 'appr') { ['apGo','lkSwitch','lkConfirm','apEdit','apReply'].forEach(x=>seen.delete(x)); }
      if (v === 'atl') { seen.delete('runStep'); seen.delete('approvePlan'); seen.delete('prApprove'); seen.delete('tab-files'); seen.delete('tab-prev'); }
    }
    await page.evaluate(() => { document.querySelector('#side')?.classList.remove('open'); document.querySelector('#drawerBg')?.classList.remove('open'); });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(out, `${v}-${name}.png`), fullPage: name === '390' && v !== 'dash' });
    const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    report.push(`[${name}/${v}] axe violations: ${ax.violations.length}` + ax.violations.map(x => `\n   - ${x.id}: ${x.nodes.length} (${x.nodes[0].target})`).join(''));
    fails += ax.violations.length;
  }
  // fin de workflow atelier vérifiée
  await page.click('#nav-atl'); report.push(`[${name}] état atelier final : ${await page.textContent('#atlState')}`);
  report.push(`[${name}] clins d'œil journalisés : ${await page.locator('#risoLog tr').count()}`);
  await ctx.close();
}
// Workflow complet de bout en bout (et vidéo < 30 s)
if (views.includes('atl')) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 800 } } });
  const page = await ctx.newPage(); await page.goto(url);
  await page.fill('#convIn', 'Une page de réservation simple'); await page.click('#convSend'); await page.waitForTimeout(700);
  await page.click('#toWork'); await page.waitForTimeout(1200);
  await page.click('#wa-ok-2'); await page.waitForTimeout(1200);
  await page.click('#openAtl');
  for (let i = 0; i < 3; i++) { await page.click('#runStep'); await page.waitForFunction(() => !document.querySelector('#steps .spin'), null, { timeout: 8000 }); await page.waitForTimeout(500); }
  await page.click('#tab-files'); await page.click('#f-1'); await page.waitForTimeout(600);
  await page.click('#tab-prev'); await page.click('#prevTry'); await page.waitForTimeout(700);
  await page.click('#tab-pr'); await page.click('#prApprove'); await page.waitForTimeout(1500);
  const fin = await page.textContent('#atlState'); report.push(`[workflow] état final : ${fin}`);
  if (!fin.includes('Terminé')) { fails++; report.push('[workflow] ÉCHEC : workflow incomplet'); }
  await page.screenshot({ path: path.join(out, 'workflow-fin-1440.png') });
  const v = page.video(); await ctx.close(); fs.renameSync(await v.path(), path.join(out, 'workflow.webm'));
}
await browser.close();
report.push(`clics: ${clicks}, échecs: ${fails}`);
fs.writeFileSync(path.join(out, `rapport-test-${views.join('-')}.txt`), report.join('\n') + '\n');
console.log(report.join('\n')); process.exit(fails ? 1 : 0);
