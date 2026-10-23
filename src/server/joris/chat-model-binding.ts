import "server-only";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assessServerEmission, TARIFF_MAX_AGE_MS, type ApprovedServerBinding, type ServerCapabilityCatalog } from "@/server/ai/server-capability-catalog";
import { executionTargetForModel } from "@/server/ai/execution-models";
import { callReservationConfigured } from "@/server/ai/call-reservation";
import type { LlmJsonProviderResult } from "@/server/ai/llm-json-provider";
import { selectChatModel } from "./chat-model-policy";
import type { ModelSelectionDecision } from "@/server/agents/models/model-selection-policy";

const id=z.string().min(1).max(160);
export const chatModelSelectionSchema=z.object({accountId:z.uuid(),modelId:id,catalogRevision:id}).strict();
export type ChatModelSelection=z.infer<typeof chatModelSelectionSchema>;
const catalogSchema=z.object({source:id,observedAt:z.iso.datetime({offset:true}),revision:id,entries:z.array(z.object({
 accountId:z.uuid(),modelId:id,provider:id,state:z.enum(["listed","connected","authorized"]),source:id,
 observedAt:z.iso.datetime({offset:true}),tools:z.boolean(),billingKind:z.enum(["api","verified_free","subscription"]),workspaceId:id,
 tariff:z.object({currency:z.literal("USD"),notToExceedCents:z.number().int().positive(),source:id,observedAt:z.iso.datetime({offset:true})}).strict().nullable(),
}).strict()).max(200)}).strict();
/** Explicit server qualification input. No browser body, public catalog or API key
 * is promoted into this file. Operators must qualify account, authorization,
 * observations, tariff and revision before installing it. Manual configuration
 * alone is not proof of account access: a future server attestation producer must
 * attest the account behind the EXISTING server API credentials. This is not a
 * credential selector: each existing provider client has one credential slot.
 * No live quota is claimed. Never contains secrets. */
export async function loadChatCapabilityCatalog():Promise<ServerCapabilityCatalog|null>{
 const path=process.env.ORIA_HQ_CHAT_CAPABILITIES_FILE;
 if(!path||!isAbsolute(path))return null;
 try{if((await stat(path)).size>200000)return null;const raw=await readFile(path,"utf8");if(raw.length>200000)return null;const parsed=catalogSchema.safeParse(JSON.parse(raw));return parsed.success?parsed.data:null;}catch{return null;}
}
export type ChatBinding={catalog:ServerCapabilityCatalog;approved:ApprovedServerBinding;callSubjectId:string;selection:Extract<ModelSelectionDecision,{eligible:true}>};
export type ChatBindingResolution={status:"ready";binding:ChatBinding}|{status:"blocked";reason:string};
export type ChatExecutionReport=Pick<LlmJsonProviderResult,"requestedModelId"|"accountId"|"executedModelId"|"provider"|"usage"|"costSource"> & {reservationStatus:string;monetaryUsd:null};
export function projectChatExecution(result:LlmJsonProviderResult):ChatExecutionReport{return {
 requestedModelId:result.requestedModelId,accountId:result.accountId,executedModelId:result.executedModelId,
 provider:result.provider,usage:result.usage,costSource:result.costSource,reservationStatus:result.reservation.status,monetaryUsd:null,
};}
export function resolveChatModelBinding(catalog:ServerCapabilityCatalog|null,workspaceId:string,selection:ChatModelSelection|undefined,nowMs=Date.now(),budgetEnabled=callReservationConfigured(),agentId="conversation",route="conversation"):ChatBindingResolution{
 if(!catalog)return {status:"blocked",reason:"catalog_unavailable"};
 const observed=Date.parse(catalog.observedAt);
 if(!Number.isFinite(observed)||observed>nowMs||nowMs-observed>TARIFF_MAX_AGE_MS)return {status:"blocked",reason:"catalog_stale"};
 if(!selection)return {status:"blocked",reason:"selection_required"};
 if(selection.catalogRevision!==catalog.revision)return {status:"blocked",reason:"catalog_changed"};
 const capability=catalog.entries.find(entry=>entry.workspaceId===workspaceId&&entry.accountId===selection.accountId&&entry.modelId===selection.modelId);
 if(!capability)return {status:"blocked",reason:"not_listed"};
 const decision=selectChatModel(capability,agentId,route);
 if(!decision.eligible)return {status:"blocked",reason:"adapter_unavailable"};
 // Compatibility checks may refuse the policy decision, never replace it.
 const target=executionTargetForModel(decision.modelId);
 if(!target.callable)return {status:"blocked",reason:"adapter_unavailable"};
 if(target.provider!==decision.providerId)return {status:"blocked",reason:"provider_mismatch"};
 const providerAccounts=new Set(catalog.entries.filter(entry=>entry.workspaceId===workspaceId&&entry.provider===target.provider&&entry.state==="authorized").map(entry=>entry.accountId));
 if(providerAccounts.size>1)return {status:"blocked",reason:"credential_binding_ambiguous"};
 const assessed=assessServerEmission({catalog,workspaceId,modelId:selection.modelId,accountId:selection.accountId,requiresTools:false,nowMs,invokedProvider:target.provider});
 if(!assessed.emit)return {status:"blocked",reason:"block" in assessed?assessed.block:"non_api_adapter_unavailable"};
 if(!budgetEnabled)return {status:"blocked",reason:"budget_gate_unavailable"};
 return {status:"ready",binding:{catalog,approved:{accountId:assessed.capability.accountId,workspaceId,modelId:decision.modelId,billingKind:assessed.billingKind,catalogRevision:catalog.revision},callSubjectId:randomUUID(),selection:decision}};
}
export function chatModelOptions(catalog:ServerCapabilityCatalog|null,workspaceId:string,nowMs=Date.now(),budgetEnabled=callReservationConfigured()){
 return (catalog?.entries??[]).filter(entry=>entry.workspaceId===workspaceId).map(entry=>{
  const selection={accountId:entry.accountId,modelId:entry.modelId,catalogRevision:catalog!.revision};
  const resolution=resolveChatModelBinding(catalog,workspaceId,selection,nowMs,budgetEnabled);
  return {...selection,provider:entry.provider,billingKind:entry.billingKind,executable:resolution.status==="ready",reason:resolution.status==="blocked"?resolution.reason:null};
 });
}
