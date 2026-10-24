import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.QUALIFICATION_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright');
const directory = path.dirname(fileURLToPath(import.meta.url));
const output = process.env.QUALIFICATION_UI_OUTPUT || '/workspace/oria-idempotency-evidence/ui';
await fs.mkdir(output,{recursive:true});
const repo = path.resolve(directory, '../..');
const evidence = {base:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),branch:execFileSync('git',['branch','--show-current'],{cwd:repo,encoding:'utf8'}).trim(),node:process.version,mode:'synthetic-only',environmentFilesLoaded:false,productBuild:'Not exercised by this isolated component harness',sourceHashes:{}};
for(const file of ['src/features/agents/components/agent-card.tsx','src/features/agents/components/agent-name-editor.tsx','src/features/employees/components/employee-team.tsx']) evidence.sourceHashes[file]=createHash('sha256').update(await fs.readFile(path.join(repo,file))).digest('hex');
const server = await createServer({configFile:path.join(directory,'vite.config.mjs')});
let browser;
const results = [], calls = [], errors = [], outbound = [];
// Test-owned state, never a product persistence adapter. It survives only this process.
const state = {A:{name:null,employees:[]},B:{name:null,employees:[]}};
const intents = new Map();
let scope = 'A', loseNext = null, readFails = false;
const snapshot = () => structuredClone(state[scope]);
try {
  await server.listen();
  browser = await chromium.launch({executablePath:process.env.QUALIFICATION_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:390,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const url = new URL(route.request().url());
    if(url.origin !== 'http://127.0.0.1:3128') {outbound.push(url.origin);return route.abort();}
    if(url.pathname !== '/__qualification') return route.continue();
    const body = route.request().postDataJSON(); calls.push(structuredClone(body));
    let response;
    if(body.kind==='snapshot') {scope=body.scope;response=snapshot();}
    else if(body.kind==='name-write') {
      assert.equal(body.input.agentId,'joris');
      state[scope].name=body.input.displayName;
      response={status:'saved',displayName:state[scope].name};
    } else if(body.kind==='employee-read') {
      response=readFails?{status:'unavailable',message:'Lecture synthétique indisponible. État non confirmé.'}:{status:'ready',employees:structuredClone(state[scope].employees.filter(e=>e.ventureId===body.ventureId))};
    } else if(body.kind==='employee-write') {
      assert.equal(body.ventureId,'business-'+scope);
      const input=body.input;
      if(input.operation==='create') {
        const {operation,creationKey,...fields}=input;
        assert.match(creationKey,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const existing=intents.get(creationKey);
        if(existing) { response=existing.scope===scope&&existing.payload===JSON.stringify(fields)?{status:'saved',employee:structuredClone(state[scope].employees.find(e=>e.id===existing.id))}:{status:'conflict',message:'Intention incompatible.'}; } else {
        const employee={...fields,id:`emp_11111111-1111-4111-8111-${String(intents.size+1).padStart(12,'0')}`,ownerId:'owner-'+scope,workspaceId:'workspace-'+scope,ventureId:body.ventureId,state:'draft',revision:1};
        state[scope].employees.push(employee);intents.set(creationKey,{scope,payload:JSON.stringify(fields),id:employee.id});response={status:'saved',employee:structuredClone(employee)};
        }
      } else {
        const employee=state[scope].employees.find(e=>e.id===input.id);
        if(!employee||employee.revision!==input.revision||employee.state!=='draft') response={status:'conflict',message:'Révision synthétique différente. Relisez puis rouvrez le profil.'};
        else {Object.assign(employee,input,{state:input.operation==='archive'?'archived':'draft',revision:employee.revision+1});delete employee.operation;response={status:'saved',employee:structuredClone(employee)};}
      }
    } else throw new Error('Unexpected synthetic operation');
    const lost=loseNext===body.kind;if(lost)loseNext=null;
    return route.fulfill({status:lost?503:200,contentType:'application/json',body:JSON.stringify(lost?{error:'synthetic lost acknowledgement'}:response)});
  });
  const base='http://127.0.0.1:3128';
  await page.goto(base); await page.getByText('Qualification désactivée.',{exact:false}).waitFor();
  assert.equal(calls.length,0);results.push('Explicit synthetic opt-in absent: zero transport calls');
  await page.goto(base+'/?qualification=synthetic');
  const builtin=page.locator('#builtin'), team=page.locator('#team');
  await builtin.getByText('Modifier le nom d’affichage',{exact:true}).click();
  await builtin.getByLabel('Nom d’affichage',{exact:true}).fill('Bob');
  loseNext='name-write';
  await builtin.getByRole('button',{name:'Enregistrer le nom',exact:true}).click();
  await builtin.getByRole('alert').filter({hasText:'Sauvegarde non confirmée'}).waitFor();
  assert.equal(await builtin.getByRole('heading',{name:'Joris',exact:true}).count(),1);
  const nameWrites=()=>calls.filter(c=>c.kind==='name-write').length;
  assert.equal(nameWrites(),1);assert.equal(state.A.name,'Bob');
  await page.locator('#refresh').click();await builtin.getByRole('heading',{name:'Bob',exact:true}).waitFor();
  assert.equal(nameWrites(),1);results.push('Name committed in synthetic store but acknowledgement lost: alert; explicit reread reconciles without resend; ID joris unchanged');
  const addEmployee=team.getByRole('button',{name:'Ajouter un employé IA',exact:true});
  await addEmployee.focus();await page.keyboard.press('Enter');
  assert.equal(await team.getByLabel('Nom d’affichage',{exact:false}).evaluate(el=>document.activeElement===el),true);
  await team.getByRole('button',{name:'Annuler l’édition'}).click();
  await team.locator('form').waitFor({state:'hidden'});
  assert.equal(await addEmployee.evaluate(el=>document.activeElement===el),true,'cancel returns keyboard focus to the form opener');
  results.push('Keyboard opens form, first field receives focus, cancel restores opener focus');
  await addEmployee.press('Enter');
  for(const [label,value] of [['Nom d’affichage','Bob'],['Spécialité','Recherche'],['Rôle dans ce business','Analyste'],['Mandat et limites','Données synthétiques uniquement'],['Contexte de l’affectation','Business A uniquement']]) await team.getByLabel(label,{exact:false}).fill(value);
  await team.getByLabel('Mandat et limites',{exact:false}).fill('Invalid\u0001control');
  await team.getByRole('button',{name:'Enregistrer le profil',exact:true}).click();
  await team.getByRole('alert').filter({hasText:'caractères non autorisés'}).waitFor();
  const instructions=team.getByLabel('Mandat et limites',{exact:false});
  assert.equal(await instructions.getAttribute('aria-invalid'),'true');
  assert.equal(await instructions.evaluate(el=>document.activeElement===el),true);
  assert.equal(calls.filter(c=>c.kind==='employee-write').length,0);
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('oria:employee-create:')).length),0);
  await instructions.fill('Données synthétiques uniquement');
  results.push('Invalid control characters are a recoverable field error before key storage or server call');
  loseNext='employee-write';
  await team.getByRole('button',{name:'Enregistrer le profil',exact:true}).click();
  await team.getByRole('alert').filter({hasText:'Le résultat n’est pas confirmé'}).waitFor();
  assert.equal(await team.getByLabel('Nom d’affichage',{exact:false}).inputValue(),'Bob');
  assert.equal(await team.locator('article').count(),0);
  const writes=()=>calls.filter(c=>c.kind==='employee-write').length;
  assert.equal(writes(),1);const identity=structuredClone(state.A.employees[0]);
  readFails=true;await team.getByRole('button',{name:'Recharger l’équipe',exact:true}).click();
  await team.getByRole('alert').filter({hasText:'État non confirmé'}).waitFor();assert.equal(writes(),1);
  readFails=false;await team.getByRole('button',{name:'Recharger l’équipe',exact:true}).click();
  await team.getByRole('heading',{name:'Bob',exact:true}).waitFor();assert.equal(writes(),1);
  assert.equal(await team.getByLabel('Nom d’affichage',{exact:false}).inputValue(),'Bob');
  assert.equal(await team.getByLabel('Nom d’affichage',{exact:false}).isDisabled(),true);
  const firstCreate=calls.find(c=>c.kind==='employee-write').input;
  await team.getByRole('button',{name:'Annuler l’édition'}).click();
  await team.getByRole('button',{name:'Reprendre la création'}).click();
  results.push('Uncertain creation retained and frozen after cancel/reopen; reread does not resend');
  await page.reload();await team.getByRole('heading',{name:'Bob',exact:true}).waitFor();
  await builtin.getByRole('heading',{name:'Bob',exact:true}).waitFor();assert.equal(writes(),1);assert.equal(nameWrites(),1);
  assert.equal(await team.getByLabel('Nom d’affichage',{exact:false}).inputValue(),'Bob');
  assert.equal(await team.getByLabel('Nom d’affichage',{exact:false}).isDisabled(),true);
  // Two synchronous events exercise the latch before React can rerender.
  await team.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await team.getByText('Profil enregistré. Aucun droit d’exécution n’a été accordé.',{exact:true}).waitFor();
  assert.equal(writes(),2);assert.equal(state.A.employees.length,1);
  const retried=calls.filter(c=>c.kind==='employee-write')[1].input;
  assert.deepEqual(retried,firstCreate);assert.equal(state.A.employees[0].id,identity.id);
  results.push('Reload restores same creation key and payload; manual retry (double submit) returns one synthetic row and no new ID');
  await team.getByRole('button',{name:'Modifier Bob',exact:true}).click();
  await team.getByLabel('Nom d’affichage',{exact:false}).fill('Bob recherche');
  await page.evaluate(()=>{window.__qualificationRandomUUID=crypto.randomUUID;Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=>{throw Error('synthetic UUID unavailable')}});});
  await team.getByRole('button',{name:'Enregistrer le profil',exact:true}).click();
  await team.getByRole('heading',{name:'Bob recherche',exact:true}).waitFor();
  assert.equal(await team.getByRole('button',{name:'Modifier Bob recherche',exact:true}).evaluate(el=>document.activeElement===el),true);
  await page.evaluate(()=>{Object.defineProperty(crypto,'randomUUID',{configurable:true,value:window.__qualificationRandomUUID});delete window.__qualificationRandomUUID;});
  results.push('Editing an existing profile does not require UUID generation; success restores focus to its edit button');
  for(const key of ['id','ownerId','workspaceId','ventureId']) assert.equal(state.A.employees[0][key],identity[key]);
  assert.equal(state.A.employees[0].revision,2);
  await page.locator('#switch').click();await team.getByText('Aucun employé enregistré pour ce business.').waitFor();
  await builtin.getByRole('heading',{name:'Joris',exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Bob recherche',exact:true}).count(),0);
  await page.locator('#switch').click();await team.getByRole('heading',{name:'Bob recherche',exact:true}).waitFor();
  results.push('Rename and remount across synthetic owner/workspace/business A/B preserve IDs and do not display A in B; server authorization not tested');
  await team.getByRole('button',{name:'Archiver Bob recherche',exact:true}).click();loseNext='employee-write';
  await team.getByRole('button',{name:'Confirmer l’archivage',exact:true}).click();
  await team.getByRole('alert').filter({hasText:'Le résultat n’est pas confirmé'}).waitFor();
  assert.equal(await team.getByText('Archivé',{exact:true}).count(),0);
  await team.getByRole('button',{name:'Recharger l’équipe',exact:true}).click();await team.getByText('Archivé',{exact:true}).waitFor();
  assert.equal(await team.getByRole('button',{name:'Modifier Bob recherche',exact:true}).count(),0);
  await page.reload();await team.getByText('Archivé',{exact:true}).waitFor();
  assert.equal(state.A.employees.length,1);assert.equal(state.A.employees[0].id,identity.id);assert.equal(writes(),4);
  results.push('Archive acknowledgement lost then reread/reload: archived row retained, no edit button, identity preserved, exactly one archive write');
  await team.getByRole('button',{name:'Ajouter un employé IA',exact:true}).click();
  for(const [label,value] of [['Nom d’affichage','Bob'],['Spécialité','Recherche'],['Rôle dans ce business','Analyste'],['Mandat et limites','Données synthétiques uniquement'],['Contexte de l’affectation','Business A uniquement']]) await team.getByLabel(label,{exact:false}).fill(value);
  await team.getByRole('button',{name:'Enregistrer le profil',exact:true}).click();
  await team.getByText('Profil enregistré. Aucun droit d’exécution n’a été accordé.',{exact:true}).waitFor();
  assert.equal(state.A.employees.length,2);assert.equal(writes(),5);
  const nextCreate=calls.filter(c=>c.kind==='employee-write').at(-1).input;
  assert.notEqual(nextCreate.creationKey,firstCreate.creationKey);assert.notEqual(state.A.employees[1].id,identity.id);
  results.push('New legitimate intention after confirmation receives a new key and distinct employee ID');
  await team.getByRole('button',{name:'Ajouter un employé IA',exact:true}).click();
  for(const [label,value] of [['Nom d’affichage','Third'],['Spécialité','Recherche'],['Rôle dans ce business','Analyste'],['Mandat et limites','Données synthétiques uniquement'],['Contexte de l’affectation','Business A uniquement']]) await team.getByLabel(label,{exact:false}).fill(value);
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new Error('synthetic storage denial')};});
  await team.getByRole('button',{name:'Enregistrer le profil',exact:true}).click();
  await team.getByRole('alert').filter({hasText:'Aucun nouvel envoi effectué'}).waitFor();
  assert.equal(writes(),5);assert.equal(state.A.employees.length,2);
  results.push('Session recovery write denied: fail closed before server action, no new employee');
  for(const width of [390,1440]) {await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,`synthetic-${width}.png`),fullPage:true});}
  assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({status:'passed',evidence,scope:'actual isolated components with synthetic test-owned transport; no real Auth/database',results,calls,externalRequests:outbound,pageErrors:errors},null,2));
  console.log(JSON.stringify({status:'passed',scenarios:results.length,results},null,2));
} finally {await browser?.close();await server.close();}
