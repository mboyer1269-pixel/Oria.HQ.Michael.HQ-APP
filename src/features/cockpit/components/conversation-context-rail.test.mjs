import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createJiti } from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src')},jsx:true});
globalThis.React=React;
const {ConversationContextRail}=await jiti.import('./conversation-context-rail.tsx');
const assistant={id:'stable',workspaceId:'w',name:'Initial',runtimeId:'configured',allowedTools:[]};
const render=(extra={})=>renderToStaticMarkup(React.createElement(ConversationContextRail,{assistant,workspaceName:'Workspace',result:null,loading:false,error:null,...extra}));
test('empty rail discloses limited scope and unknowns',()=>{
 const html=render();assert.match(html,/Aucun échange envoyé/);assert.match(html,/pas une mémoire persistante/);assert.match(html,/Aucun lien valide fourni/);assert.doesNotMatch(html,/en ligne|vérifié avec succès/);
});
test('proposal remains confirmation required, never proof of execution',()=>{
 const html=render({result:{summary:'Proposition',requiresConfirmation:true,ledgerStatus:'recorded'}});
 assert.match(html,/confirmation requise/);assert.match(html,/pas une vérification indépendante/);assert.match(html,/Enregistrement rapporté/);
});
test('links reuse dossier validator and reject arbitrary URLs',()=>{
 assert.match(render({result:{summary:'x',missionPlanResult:{missionId:'mission_1'}}}),/href="\/hq\/missions\?mission=mission_1#requested-mission"/);
 assert.doesNotMatch(render({result:{summary:'x',missionPlanResult:{missionId:'javascript:alert(1)'}}}),/href=/);
});
test('rename changes display only, stable identity retained',()=>{
 const html=render({assistant:{...assistant,name:'Bob'}});assert.match(html,/Bob/);assert.match(html,/ID stable : stable/);assert.doesNotMatch(html,/Initial/);
});
test('pending and failed exchanges do not claim a result',()=>{
 assert.match(render({loading:true}),/Réponse en attente/);assert.match(render({error:'synthetic'}),/saisie conservée/);
});
