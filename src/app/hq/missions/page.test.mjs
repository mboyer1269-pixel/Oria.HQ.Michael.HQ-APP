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
    export async function listMissionPage(scope,filter){state.calls.push(['page',scope,filter]);return state.page;}
    export function createDevelopmentStore(){state.calls.push(['store']);return state.unavailable?null:{load:async(...args)=>{state.calls.push(['load',...args]);return await state.load();}};}
    export async function listMissionsForWorkspace(scope){state.calls.push(['local',scope]);return {missions:state.local};}
    export function evaluateMissionApproval(){throw Error('not part of the server-page projection');}
    export const serverEnv={};
    export function resolvePaperclipBinding(){return {status:'disabled'};}
    export function CockpitShell({children}){return children;}
    export function DevelopmentMissionForm(){return null;}
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
    assert.equal(network,0);
  } finally {globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true});}
});
