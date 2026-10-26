// Captures 1440/390 (vide, erreur, validé) + axe.
// PW_PATH = dossier node_modules contenant playwright et @axe-core/playwright ; sinon résolution normale des paquets.
const PW=process.env.PW_PATH;
const { chromium } = await import(PW ? PW+'/playwright/index.mjs' : 'playwright');
const { default: AxeBuilder } = await import(PW ? PW+'/@axe-core/playwright/dist/index.mjs' : '@axe-core/playwright');
const b=await chromium.launch(); const out=[];
for (const w of [1440,390]) {
  const ctx=await b.newContext({viewport:{width:w,height:w===390?844:900}}); const p=await ctx.newPage();
  await p.goto('file://'+process.cwd()+'/index.html');
  const axe=async s=>{const r=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();out.push(`${w} ${s}: ${r.violations.length} violation(s) ${r.violations.map(v=>v.id+'('+v.nodes.length+')').join(' ')}`)};
  await p.screenshot({path:`preuves/vide-${w}.png`,fullPage:true}); await axe('vide');
  await p.click('#go'); await p.waitForTimeout(200);
  await p.screenshot({path:`preuves/erreur-${w}.png`,fullPage:true}); await axe('erreur');
  await p.click('#ex'); await p.click('#go'); await p.waitForTimeout(200);
  await p.screenshot({path:`preuves/valide-exemple-${w}.png`,fullPage:true}); await axe('valide');
  await ctx.close();
}
await b.close(); console.log(out.join('\n'));
