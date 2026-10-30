import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createJiti } from "jiti";

const requestedId = "77777777-7777-4777-8777-777777777777";
const mission = (id, patch = {}) => ({ id, workspaceId: "fixture-workspace", modeId: "fixture-mode", title: `Mission ${id}`, objective: "Objective", expectedOutput: "Report", status: "draft", riskLevel: "low", autonomyLevel: 0, requiresApproval: false, assignedAgentId: "", input: {}, result: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...patch });
function allNodes(node) {
  if (Array.isArray(node)) return node.flatMap(allNodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...allNodes(node.props?.children)];
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node && typeof node === "object" ? textOf(node.props?.children) : "";
}

// Invoke the actual server page; auth and remote reads are injected only in this
// temporary harness. Inspect its real component props, not a copied projection.
test("mission receipt navigation keeps one scoped dossier and an exact review destination", async t => {
  const dir = mkdtempSync(path.join(tmpdir(), "missions-page-coherence-"));
  const file = path.join(dir, "boundaries.mjs");
  writeFileSync(file, `
    export const state={calls:[],gate:null,page:null,load:null,local:[],unavailable:false};
    export async function requireOwnerAccess(route){state.calls.push(['owner',route]);return await state.gate();}
    export function getActiveWorkspaceContext(){state.calls.push(['scope']);return {activeWorkspace:{id:'fixture-workspace'},activeMode:{id:'fixture-mode'}};}
    export async function listMissionPage(scope,filter){state.calls.push(['page',scope,filter]);if(state.page instanceof Error)throw state.page;return state.page;}
    export function createDevelopmentStore(){state.calls.push(['store']);return state.unavailable?null:{load:async(...args)=>{state.calls.push(['load',...args]);return await state.load();}};}
    export async function listMissionsForWorkspace(scope){state.calls.push(['local',scope]);return {missions:state.local};}
    export function evaluateMissionApproval(){throw Error('not part of the server-page projection');}
    export const serverEnv={};
    export function resolvePaperclipBinding(){return {status:'disabled'};}
    export function CockpitShell({children}){return children;}
    export function DevelopmentMissionForm(){return null;}
    export function useRouter(){return {refresh(){state.calls.push(['refresh']);}};}
    export default function Link({children}){return children;}
    export function OrchestrationProjection(){return null;}
    export async function signOutAction(){throw Error('unexpected write');}
  `);
  const originalFetch = globalThis.fetch; let network = 0;
  globalThis.fetch = async () => { network++; throw Error("unexpected network"); };
  try {
    const { state } = await import(pathToFileURL(file).href);
    const aliases = ["@/server/auth/owner", "@/server/auth/actions", "@/core/workspace-context", "@/server/missions/development-mission", "@/server/missions", "@/lib/server-env", "@/server/orchestration/workspace-binding", "@/features/cockpit/components/cockpit-shell", "@/features/missions/components/development-mission-form", "@/features/missions/components/orchestration-projection"];
    const pageBoundary = path.join(dir, "page-boundary.ts");
    writeFileSync(pageBoundary, `export { listMissionPage } from ${JSON.stringify(file)}; export { parseMissionPageFilter, missionPageHref, MISSION_PAGE_SIZE } from ${JSON.stringify(path.join(process.cwd(), "src/server/missions/mission-page.ts"))};`);
    const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, fsCache: false, alias: {
      ...Object.fromEntries(aliases.map(key => [key, file])), "@/server/missions/mission-page": pageBoundary,
      "@/server/missions/approval-service": path.join(process.cwd(), "src/server/missions/approval-service.ts"),
      "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs"), "@": path.join(process.cwd(), "src"),
    }});
    const { default: MissionsPage } = await jiti.import("./page.tsx");
    function reset() {
      state.calls.length = 0; state.unavailable = false; state.local = [];
      state.gate = () => ({ status: "authorized", user: { id: "fixture-owner" } });
      state.load = () => mission(requestedId, { status: "needs_approval" });
      state.page = {missions:[mission("paged")],source:"supabase",summary:{total:26,running:0,needs_approval:1,completed:0,failed:0,draft:25,queued:0,cancelled:0},filteredTotal:26,reviewTotal:1,pageNumber:1};
    }
    const call = (params = {mission:requestedId}) => MissionsPage({searchParams:Promise.resolve(params)});
    const byName = (tree, name) => allNodes(tree).filter(node => node.type?.name === name);

    await t.test("the owner gate resolves before scope or mission reads", async () => {
      reset(); let resolve; state.gate = () => new Promise(done => { resolve = done; });
      const pending = call(); await Promise.resolve(); assert.deepEqual(state.calls, [["owner","/hq/missions"]]);
      resolve({status:"forbidden",user:{email:"outsider@example.invalid"}});
      assert.equal((await pending).type.name,"OwnerAccessDenied");
      assert.deepEqual(state.calls, [["owner","/hq/missions"]]);
      for (const error of [Object.assign(Error("redirect"),{digest:"NEXT_REDIRECT"}),Error("auth unavailable")]) {
        reset(); state.gate = () => { throw error; }; await assert.rejects(call, actual => actual === error);
        assert.deepEqual(state.calls, [["owner","/hq/missions"]]);
      }
    });
    await t.test("an off-page receipt opens one dossier, retaining the current page and its counts", async () => {
      reset(); const tree=await call(); const dossiers=byName(tree,"MissionDossier");
      assert.equal(dossiers.length,1); assert.deepEqual(dossiers[0].props.missions.map(m=>m.id),[requestedId,"paged"]);
      assert.equal(dossiers[0].props.initialSelectedId,requestedId);
      assert.match(textOf(tree),/26\s+résultat/); assert.match(textOf(tree),/1–1/);
      assert.deepEqual(byName(tree,"MissionKanbanBoard")[0].props.missions.map(m=>m.id),["paged"]);
      assert.deepEqual(state.calls.find(([kind])=>kind==='load'),['load','fixture-workspace',requestedId]);
    });
    await t.test("a receipt already in the page appears only once and uses its freshly read version", async () => {
      reset(); state.page.missions=[mission("paged"),mission(requestedId,{title:"older snapshot"})];
      const dossiers=byName(await call(),"MissionDossier"); assert.equal(dossiers.length,1);
      assert.equal(dossiers[0].props.missions.filter(m=>m.id===requestedId).length,1);
      assert.equal(dossiers[0].props.missions.find(m=>m.id===requestedId).title,`Mission ${requestedId}`);
    });
    await t.test("an exact off-page approval remains reachable without the review filter", async () => {
      reset(); const tree=await call();
      assert.ok(allNodes(tree).some(node=>node.props?.id==='mission-approval'));
      assert.deepEqual(byName(tree,"MissionApprovalPanel").flatMap(node=>node.props.missions.map(m=>m.id)),[requestedId]);
    });
    await t.test("an ordinary requested mission does not fabricate a required decision", async () => {
      reset();state.load=()=>mission(requestedId);const tree=await call();
      assert.equal(byName(tree,'MissionApprovalPanel').length,0);
      assert.equal(allNodes(tree).some(node=>node.props?.id==='mission-approval'),false);
    });
    await t.test("review pagination never duplicates the explicit mission decision controls", async () => {
      reset(); state.page.missions=[mission(requestedId,{status:'needs_approval'}),mission('second-review',{requiresApproval:true})];
      const tree=await call({mission:requestedId,status:'review'});
      const ids=byName(tree,"MissionApprovalPanel").flatMap(node=>node.props.missions.map(m=>m.id));
      assert.deepEqual(ids,[requestedId,'second-review']); assert.equal(new Set(ids).size,ids.length);
    });
    await t.test("unavailable requested storage is not claimed to be an absent mission", async () => {
      for (const unavailable of [false,true]) {
        reset(); state.unavailable=unavailable;state.load=()=>{throw Error('private upstream detail');};
        const tree=await call();assert.match(textOf(tree),/Lecture de cette mission indisponible/);
        assert.doesNotMatch(textOf(tree),/introuvable|private upstream/);
        assert.equal(byName(tree,'MissionApprovalPanel').length,0);
        assert.equal(byName(tree,'MissionDossier').length,1);
      }
    });
    await t.test("a foreign id, workspace or mode cannot become the selected dossier or approval", async () => {
      for (const patch of [{id:'foreign'},{workspaceId:'foreign'},{modeId:'foreign'}]) {
        reset();state.load=()=>mission(requestedId,patch);const tree=await call();
        assert.match(textOf(tree),/introuvable/);
        assert.deepEqual(byName(tree,'MissionDossier')[0].props.missions.map(m=>m.id),['paged']);
        assert.equal(byName(tree,'MissionApprovalPanel').length,0);
      }
    });
    await t.test("invalid/absent receipts do not read storage, and ordinary review lists remain intact", async () => {
      for(const value of [undefined,'../other',[requestedId]]) {
        reset();state.page.missions=[mission('paged',{requiresApproval:true})];const tree=await call({mission:value,status:'review'});
        assert.equal(state.calls.some(([kind])=>kind==='store'||kind==='load'||kind==='local'),false);
        assert.deepEqual(byName(tree,'MissionApprovalPanel')[0].props.missions.map(m=>m.id),['paged']);
        assert.equal(byName(tree,'MissionDossier').length,1);
      }
    });
    await t.test("the selected dossier comes before creation and secondary views stay disclosed", async () => {
      reset(); const tree=await call(); const nodes=allNodes(tree);
      assert.ok(nodes.findIndex(n=>n.type?.name==='MissionDossier') < nodes.findIndex(n=>n.type?.name==='DevelopmentMissionForm'));
      for (const label of ['Rechercher dans les missions','Vue Kanban','Suivi technique']) {
        const details=nodes.find(n=>n.type==='details' && textOf(n.props.children).includes(label));
        assert.ok(details, label); assert.notEqual(details.props.open,true);
      }
      const review=nodes.find(n=>n.props?.id==='mission-approval');
      assert.ok(review);
      assert.ok(!nodes.filter(n=>n.type==='details').some(n=>allNodes(n).includes(review)));
    });
    await t.test("active search filters are visible rather than silently applied", async () => {
      reset(); const tree=await call({q:'fixture',status:'review'});
      const details=allNodes(tree).find(n=>n.type==='details' && textOf(n.props.children).includes('Rechercher dans les missions'));
      assert.equal(details?.props.open,true);
    });
    await t.test("listing failures expose a scoped read-only retry, not fabricated zero totals", async () => {
      reset(); state.page=Error('private upstream detail');
      const tree=await call({mission:requestedId,q:'audit & QA',status:'review',page:'2'});
      assert.match(textOf(tree),/Lecture des missions indisponible/);
      assert.doesNotMatch(textOf(tree),/Aucune mission|0 résultat|private upstream/);
      for(const name of ['MissionDossier','MissionKanbanBoard','MissionApprovalPanel']) assert.equal(byName(tree,name).length,0);
      assert.equal(state.calls.some(([kind])=>kind==='store'||kind==='load'),false);
      assert.ok(allNodes(tree).some(n=>n.props?.href===`/hq/missions?page=2&q=audit+%26+QA&status=review&mission=${requestedId}`));
    });
    await t.test("empty data keeps one creation form first while existing data keeps it mounted after the dossier", async () => {
      for(const empty of [true,false]) {
        reset(); if(empty)state.page={...state.page,missions:[],filteredTotal:0};
        const nodes=allNodes(await call({}));
        assert.equal(nodes.filter(n=>n.type?.name==='DevelopmentMissionForm').length,1);
        const creation=nodes.findIndex(n=>n.type?.name==='DevelopmentMissionForm');const dossier=nodes.findIndex(n=>n.type?.name==='MissionDossier');
        assert.equal(creation<dossier,empty);
        assert.equal(nodes[creation].key,'development-form');
      }
    });
    await t.test("a frozen real development form survives success, unavailable, empty and restored page reads", async () => {
      // Actual ReactDOM reconciliation and actual form hooks/handlers. The DOM is
      // synthetic (@xmldom is already installed); this is not browser/layout QA.
      const { DOMImplementation } = await import('@xmldom/xmldom');
      const React = await import('react');
      const document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml','html');
      const prototype = Object.getPrototypeOf(document.createElement('div'));
      const previousListeners = {add:prototype.addEventListener,remove:prototype.removeEventListener,style:prototype.style};
      prototype.addEventListener=prototype.removeEventListener=()=>{}; prototype.style={};
      const body=document.createElement('body');document.documentElement.appendChild(body);
      document.body=body;document.activeElement=body;document.addEventListener=document.removeEventListener=()=>{};
      const window={document,addEventListener(){},removeEventListener(){},HTMLIFrameElement:function(){},HTMLElement:prototype.constructor};
      document.defaultView=window;
      const saved=Object.fromEntries(['window','document','sessionStorage','IS_REACT_ACT_ENVIRONMENT','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
      const storage=new Map();const requests=[];
      Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true,
        sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
        fetch:async(url,options)=>{requests.push({url,method:options.method,body:options.body});throw Error('simulated lost acknowledgement');}});
      let root;
      try {
        const {createRoot}=await import('react-dom/client');
        const formJiti=createJiti(import.meta.url,{jsx:{runtime:'automatic'},fsCache:false,alias:{'next/navigation':file,'next/link':file,'@':path.join(process.cwd(),'src')}});
        const {DevelopmentMissionForm}=await formJiti.import(path.join(process.cwd(),'src/features/missions/components/development-mission-form.tsx'));
        const container=document.createElement('main');body.appendChild(container);root=createRoot(container);
        // Preserve the page's exact arrays, keys and ancestors. Only unrelated
        // presentation components are host placeholders; the form stays real.
        function skeleton(node){
          if(Array.isArray(node))return node.map(skeleton);
          if(!React.isValidElement(node))return node;
          const key=node.key===null?{}:{key:node.key};
          if(node.type?.name==='DevelopmentMissionForm')return React.createElement(DevelopmentMissionForm,{...node.props,...key});
          const children=skeleton(node.props.children);
          return React.createElement(node.type===React.Fragment?React.Fragment:'div',key,...(Array.isArray(children)?children:[children]));
        }
        async function show(kind){
          reset();if(kind==='unavailable')state.page=Error('read unavailable');
          if(kind==='empty')state.page={...state.page,missions:[],filteredTotal:0};
          const tree=await call({});
          await React.act(async()=>{root.render(skeleton(tree));await new Promise(resolve=>setTimeout(resolve,5));});
        }
        const textareas=()=>Array.from(container.getElementsByTagName('textarea'));
        const handlers=node=>Object.entries(node).find(([key])=>key.startsWith('__reactProps$'))?.[1];
        await show('success');
        const values=['Frozen title','Frozen objective','Frozen scope','Frozen acceptance'];
        for(let index=0;index<values.length;index++)await React.act(async()=>{handlers(textareas()[index]).onChange({target:{value:values[index]}});});
        await React.act(async()=>{handlers(container.getElementsByTagName('form')[0]).onSubmit({preventDefault(){}});});
        assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');
        const submitted=JSON.parse(requests[0].body);assert.equal(submitted.title,'Frozen title');
        const frozenNodes=textareas();assert.ok(frozenNodes.every(node=>handlers(node).disabled===true));
        for(const kind of ['unavailable','success','empty','success']){
          await show(kind);
          assert.ok(textareas().length===frozenNodes.length && textareas().every((node,index)=>node===frozenNodes[index]),kind+' must retain the mounted form DOM nodes');
          assert.deepEqual(textareas().map(node=>handlers(node).value),values,kind+' preserves frozen values');
          assert.ok(textareas().every(node=>handlers(node).disabled===true),kind+' preserves frozen submission state');
          assert.equal(requests.length,1,kind+' must not resubmit or read automatically');
          assert.match(container.textContent,new RegExp(submitted.requestId));
        }
      } finally {
        if(root)await React.act(async()=>root.unmount());
        for(const [key,descriptor] of Object.entries(saved))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
        for(const [key,value] of [['addEventListener',previousListeners.add],['removeEventListener',previousListeners.remove],['style',previousListeners.style]])if(value===undefined)delete prototype[key];else prototype[key]=value;
      }
    });
    assert.equal(network,0);
  } finally {globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true});}
});
