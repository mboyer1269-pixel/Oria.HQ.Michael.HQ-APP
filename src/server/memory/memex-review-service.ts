import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { readConfiguredHandle } from "@/server/mcp/memex-http-transport";
import { workspaceIdToMemexNamespace } from "@/server/mcp/memex-readonly-client";
const id = z.string().min(1).max(160);
const nullableText = z.string().max(100000).nullable();
export const reviewProposalSchema = z.object({
  id, tenant: id, namespace: id, proposedBy: id, sourceClient: id, content: z.string().max(100000),
  suggestedEntities: nullableText, suggestedRelations: nullableText, provenance: nullableText,
  confidence: z.number().finite().nullable(), riskFlags: nullableText,
  status: z.enum(["proposed", "quarantined", "approved", "rejected", "publishing", "promoted"]),
  createdAt: z.string(), reviewedAt: z.string().nullable(), review_required: z.union([z.literal(0), z.literal(1)]),
}).strict();
export const snapshotSchema = z.object({ proposal: reviewProposalSchema, payloadHash: z.string().regex(/^[a-f0-9]{64}$/), hashVersion: z.literal(1) }).strict();
export type ReviewSnapshot = z.infer<typeof snapshotSchema>;
export type ReviewDecision = { proposalId: string; expectedPayloadHash: string; hashVersion: 1; decisionId: string; decision: "approve" | "reject" };
const receiptSchema = z.object({ hashVersion: z.literal(1), decisionId: id, proposalId: id, namespace: id, reviewerId: id, technicalPrincipal: id, decision: z.enum(["approve", "reject"]), payloadHash: z.string().regex(/^[a-f0-9]{64}$/), reviewedAt: z.string().datetime() }).strict();
export type ReviewReceipt = z.infer<typeof receiptSchema>;
export type ReviewResult = { status: "snapshot"; snapshot: ReviewSnapshot } | { status: "decided"; receipt: ReviewReceipt } | { status: "disabled" | "unconfigured" | "workspace_unbound" | "unavailable" | "outcome_unknown" | "not_found" | "conflict" | "unsupported_snapshot" };
function canonical(v: unknown): unknown { return Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)])) : v; }
export function validateReviewSnapshot(raw: unknown, namespace: string, proposalId: string): ReviewSnapshot {
  const snapshot = snapshotSchema.parse(raw); const proposal = snapshot.proposal;
  if (proposal.namespace !== namespace || proposal.tenant !== namespace || proposal.id !== proposalId) throw Error("scope");
  const payload: Record<string, unknown> = { hashVersion: 1 };
  for (const key of ["id","tenant","namespace","proposedBy","sourceClient","content","provenance","confidence","riskFlags"] as const) payload[key] = proposal[key] ?? null;
  for (const key of ["suggestedEntities","suggestedRelations"] as const) { payload[key] = JSON.parse(proposal[key] || "[]"); if (!Array.isArray(payload[key])) throw Error("schema"); }
  if (createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex") !== snapshot.payloadHash) throw Error("hash");
  return snapshot;
}
type Env = Readonly<Record<string, string | undefined>>;
export function resolveReviewBinding(env: Env, workspaceId: string) {
  if (env.ORIA_ENABLE_MEMEX_REVIEW !== "1") return { status: "disabled" } as const;
  if (!env.MEMEX_REVIEW_ENDPOINT || !env.MEMEX_REVIEW_TOKEN_FILE || !env.MEMEX_REVIEW_HQ_WORKSPACE_ID) return { status: "unconfigured" } as const;
  if (env.MEMEX_REVIEW_HQ_WORKSPACE_ID !== workspaceId) return { status: "workspace_unbound" } as const;
  try {
    const url = new URL(env.MEMEX_REVIEW_ENDPOINT);
    if (url.origin !== env.MEMEX_REVIEW_ENDPOINT || url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(url.hostname)))) throw Error("url");
    const token = readConfiguredHandle({ MEMEX_HTTP_READ_HANDLE_FILE: env.MEMEX_REVIEW_TOKEN_FILE });
    if (!/^opr1\.[A-Za-z0-9_-]{43}$/.test(token)) throw Error("token");
    return { status: "ready", origin: url.origin, token, namespace: workspaceIdToMemexNamespace(workspaceId) } as const;
  } catch { return { status: "unconfigured" } as const; }
}
export function createMemexReviewService(deps: { env?: () => Env; fetcher?: typeof fetch } = {}) {
  return async (workspaceId: string, proposalId: string, decision?: ReviewDecision & { reviewerId: string }): Promise<ReviewResult> => {
    const binding = resolveReviewBinding(deps.env?.() ?? process.env, workspaceId); if (binding.status !== "ready") return binding;
    const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),5000); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const operation = async (): Promise<ReviewResult> => {
        const response = await (deps.fetcher ?? fetch)(`${binding.origin}/operator/review/${decision ? "decision" : "snapshot"}`, { method:"POST", redirect:"error", cache:"no-store", signal:controller.signal,
          headers: { "Content-Type":"application/json", Authorization:`Bearer ${binding.token}` }, body: JSON.stringify({ namespace:binding.namespace, proposalId, ...decision }) });
        if (response.status === 404) return {status:"not_found"}; if(response.status===409) return {status:"conflict"};
        if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("application/json")) throw Error("response");
        reader=response.body.getReader(); const chunks:Uint8Array[]=[];let size=0;
        while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>512*1024)throw Error("size");chunks.push(part.value);}
        const raw:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));
        if (!decision) { try{return {status:"snapshot",snapshot:validateReviewSnapshot(raw,binding.namespace,proposalId)};}catch{return {status:"unsupported_snapshot"};} }
        const receipt=receiptSchema.parse(raw);
        if(receipt.namespace!==binding.namespace || receipt.proposalId!==proposalId || receipt.reviewerId!==decision.reviewerId || receipt.decisionId!==decision.decisionId || receipt.payloadHash!==decision.expectedPayloadHash || receipt.decision!==decision.decision)throw Error("receipt");
        return {status:"decided",receipt};
      };
      return await Promise.race([operation(),new Promise<never>((_,reject)=>controller.signal.addEventListener("abort",()=>reject(Error("timeout")),{once:true}))]);
    } catch { return {status:decision?"outcome_unknown":"unavailable"}; }
    finally {clearTimeout(timer);controller.abort();if(reader)void reader.cancel().catch(()=>{});}
  };
}
export const reviewMemexProposal = createMemexReviewService();
