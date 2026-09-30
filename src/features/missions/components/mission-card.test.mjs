import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createJiti} from "jiti";
globalThis.React=React;
const jiti=createJiti(import.meta.url,{jsx:true,alias:{"@":path.join(process.cwd(),"src")}});
const {MissionCard}=await jiti.import("./mission-card.tsx");
const mission={id:"test",title:"Real draft",objective:"Task",status:"draft",riskLevel:"medium",requiresApproval:true,assignedAgentId:"",autonomyLevel:0,input:{},expectedOutput:"Tests",createdAt:"2026-09-29",updatedAt:"2026-09-29"};
test("unassigned real draft displays honest agent and approval labels",()=>{
 const html=renderToStaticMarkup(React.createElement(MissionCard,{mission}));assert.ok(html.includes("Non attribué"));assert.ok(html.includes("Approbation requise"));assert.ok(!html.includes("Mock exécuteur"));
});
test("unknown assignee stays unidentified instead of inventing a model",()=>{
 const html=renderToStaticMarkup(React.createElement(MissionCard,{mission:{...mission,assignedAgentId:"opaque-unknown"}}));assert.ok(html.includes("Agent à identifier"));assert.ok(!html.includes("opaque-unknown"));
});
