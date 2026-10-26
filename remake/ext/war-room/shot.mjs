import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';
const b=await chromium.launch();
for (const w of [1440,390]) { const p=await b.newPage({viewport:{width:w,height:w===390?844:900}});
 await p.goto('file://'+process.cwd()+'/index.html');
 for (const v of ['appr','mis','cost']) { await p.click('#nav-'+v); await p.waitForTimeout(400);
  await p.screenshot({path:`preuves/ecran-${v}-${w}.png`});
  if (v==='appr'){ await p.check('#lkSwitch'); await p.check('#lkConfirm'); await p.click('#apGo'); await p.click('#apEdit'); await p.locator('#apStale').scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({path:`preuves/ecran-appr-perimee-${w}.png`}); }
  if (v==='mis'){ await p.click('#misSilent'); await p.click('#misStop'); await p.waitForTimeout(2800); await p.locator('#misTl').scrollIntoViewIfNeeded(); await p.screenshot({path:`preuves/ecran-mis-inconnu-${w}.png`}); }
  if (v==='cost'){ await p.click('#costTpl'); await p.click('#tr-0'); await p.waitForTimeout(300); await p.screenshot({path:`preuves/ecran-cost-trace-${w}.png`}); }
 } await p.close(); }
await b.close();
