// Synthetic SSR benchmark; no credentials, database, server, or provider calls.
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {performance} from 'node:perf_hooks';
import {createJiti} from 'jiti';
import path from 'node:path';
globalThis.React=React;
const jiti=createJiti(import.meta.url,{jsx:true,alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {MissionKanbanBoard}=await jiti.import('../../features/missions/components/mission-kanban-board.tsx');
const {paginateLocalMissions}=await jiti.import('../../server/missions/mission-page.ts');
const n=Number(process.argv[2]??1000);
if(!Number.isInteger(n)||n<25||n>10000)throw Error('Volume must be 25..10000');
const data=Array.from({length:n},(_,i)=>({id:String(i).padStart(6,'0'),workspaceId:'synthetic',modeId:'hq',title:`Synthetic mission ${i}`,objective:'x'.repeat(1000),assignedAgentId:'',autonomyLevel:0,status:'draft',riskLevel:'medium',input:{development:{scope:'x'.repeat(500),acceptanceCriteria:'x'.repeat(1000)}},expectedOutput:'x'.repeat(1500),requiresApproval:true,createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z'}));
const page=paginateLocalMissions(data,{page:1,q:'',status:'all'}).missions;
function measure(missions){
 const render=()=>renderToStaticMarkup(React.createElement(MissionKanbanBoard,{missions}));render();
 const samples=[];let html;for(let i=0;i<5;i++){const start=performance.now();html=render();samples.push(performance.now()-start);}
 return {rows:missions.length,jsonBytes:Buffer.byteLength(JSON.stringify(missions)),htmlBytes:Buffer.byteLength(html),medianRenderMs:Math.round(samples.sort((a,b)=>a-b)[2]),samplesMs:samples.map(Math.round)};
}
console.log(JSON.stringify({synthetic:true,node:process.version,volume:n,before:measure(data),after:measure(page),limits:'Actual Kanban React SSR in local development mode. Excludes database, auth, network, client hydration and other components. Counts use eight parallel HEAD requests plus one data query; no database latency improvement established.'},null,2));
