import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJiti} from 'jiti';
globalThis.React=React;
const root=process.cwd(),temp=mkdtempSync(path.join(tmpdir(),'oria-document-navigation-'));
const auth=path.join(temp,'owner.mjs');
writeFileSync(auth,'export async function requireOwnerAccess(path){globalThis.__documentNavigationPath=path;return {status:"authorized",user:{}};}');
const jiti=createJiti(import.meta.url,{jsx:true,moduleCache:false,fsCache:false,alias:{'@':path.join(root,'src'),'@/server/auth/owner':auth}});
const {PrivateHqOverview}=await jiti.import('./private-hq-overview.tsx');
const {default:DocumentsDashboard}=await jiti.import(path.join(root,'src/app/dashboard/documents/page.tsx'));
test.after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__documentNavigationPath;});
test('overview document entries describe module status, not an available vault',()=>{
 const html=renderToStaticMarkup(React.createElement(PrivateHqOverview));
 const links=[...html.matchAll(/<a\b[^>]*href="\/dashboard\/documents"[^>]*>([\s\S]*?)<\/a>/g)];
 assert.equal(links.length,2);
 assert.ok(links.every(([markup])=>markup.includes('focus-visible:outline-2')&&markup.includes('min-h-11')));
 assert.match(links[0][1],/Statut du module Documents/);
 assert.match(links[1][1],/Voir le statut du module/);
 assert.doesNotMatch(html,/Ouvrir documents|Le coffre privé pour notes/);
});
test('direct route preserves owner gate and two keyboard-native return links to HQ',async()=>{
 const html=renderToStaticMarkup(await DocumentsDashboard());
 assert.equal(globalThis.__documentNavigationPath,'/dashboard/documents');
 assert.match(html,/Module retiré temporairement/);
 const links=[...html.matchAll(/<a\b[^>]*href="\/hq"[^>]*>[\s\S]*?<\/a>/g)];
 assert.equal(links.length,2);
 assert.ok(links.every(([markup])=>markup.includes('focus-visible:outline-2')&&markup.includes('min-h-11')));
 assert.doesNotMatch(html,/<button|<input|<form/);
 // Optional artifact for isolated native-link keyboard checks. Synthetic auth only.
 if(process.env.DOCUMENT_NAVIGATION_HTML)writeFileSync(process.env.DOCUMENT_NAVIGATION_HTML,html);
});
