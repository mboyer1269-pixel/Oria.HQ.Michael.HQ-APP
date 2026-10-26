import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const require = createRequire(import.meta.url);
const {chromium} = require('/opt/codex/cua_node/lib/node_modules/playwright');
const directory = path.dirname(fileURLToPath(import.meta.url));
const output = '/workspace/oria-readiness-evidence';
await fs.mkdir(output,{recursive:true});
const server = await createServer({configFile:path.join(directory,'vite.config.mjs')});
const results = [], errors = [], outbound = [];
let browser;
try {
  await server.listen();
  browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin !== 'http://127.0.0.1:3138') { outbound.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  for(const width of [375,425,768,1024,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('http://127.0.0.1:3138');
    const summary = page.locator('summary');
    await summary.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('details').getAttribute('open'),'');
    assert.ok(await page.getByText('Modèle et exécution',{exact:true}).isVisible());
    assert.ok(await summary.evaluate(el=>el.getBoundingClientRect().height>=44));
    assert.ok(await summary.evaluate(el=>getComputedStyle(el).outlineStyle !== 'none'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
    assert.equal(await page.getByRole('button',{name:/activer|lancer/i}).count(),0);
    await page.screenshot({path:path.join(output,`readiness-${width}.png`),fullPage:true});
    await page.keyboard.press('Space');
    assert.equal(await page.locator('details').getAttribute('open'),null);
    await page.keyboard.press('Tab');
    assert.match(await page.locator(':focus').textContent(),/Modifier/);
    results.push(`${width}px: no overflow, disclosure Enter/Space, visible focus, 44px target, Tab to existing Modify`);
  }
  await page.setViewportSize({width:375,height:1000});
  await page.goto('http://127.0.0.1:3138/?scenario=long-name');
  await page.locator('summary').waitFor();
  assert.ok(await page.locator('summary').evaluate(el=>el.scrollWidth<=el.clientWidth));
  results.push('80-character unbroken display name wraps within disclosure');
  for(const scenario of ['empty','error','partial','archived']) {
    await page.goto(`http://127.0.0.1:3138/?scenario=${scenario}`);
    if(scenario === 'empty') {await page.getByText('Aucun employé enregistré pour ce business.',{exact:true}).waitFor(); assert.equal(await page.locator('details').count(),0);}
    if(scenario === 'error') {await page.getByText(/L’absence d’employés ne peut pas être confirmée/).waitFor();assert.equal(await page.locator('details').count(),0);assert.ok(await page.getByRole('button',{name:'Ajouter un employé IA'}).isDisabled());}
    if(scenario === 'partial' || scenario === 'archived') {
      await page.locator('summary').click();
      await page.getByText(scenario === 'partial' ? /Rôle ou mandat incomplet/ : 'Profil archivé · non opérationnel',{exact:scenario === 'archived'}).waitFor();
      if(scenario === 'archived') assert.equal(await page.getByRole('button',{name:/Modifier/}).count(),0);
    }
    assert.doesNotMatch(await page.locator('main').textContent(),/prêt à exécuter/i);
    results.push(`${scenario}: explicit state, no false ready`);
  }
  await page.goto('http://127.0.0.1:3138');
  await page.getByRole('button',{name:'Recharger l’équipe'}).click();
  assert.equal(await page.getByRole('region',{name:'Mon équipe'}).getAttribute('aria-busy'),'true');
  assert.ok(await page.getByRole('button',{name:'Recharger l’équipe'}).isDisabled());
  await page.getByRole('alert').filter({hasText:'Lecture synthétique indisponible.'}).waitFor();
  await page.locator('summary').click();
  assert.ok(await page.getByText('Profil proposé · non opérationnel',{exact:true}).isVisible());
  results.push('Loading disables writes; failed reread retains explicitly non-operational profile and shows error');
  assert.deepEqual(errors,[]); assert.deepEqual(outbound,[]);
  await fs.writeFile(path.join(output,'ui-results.json'),JSON.stringify({mode:'synthetic-only; no real DB/Auth; no Next build',node:process.version,results,errors,outbound},null,2));
  console.log(JSON.stringify({passed:results.length,results},null,2));
} finally { await browser?.close(); await server.close(); }
