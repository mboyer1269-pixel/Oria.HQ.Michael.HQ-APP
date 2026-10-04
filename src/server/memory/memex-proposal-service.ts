import "server-only";
import { createMemexProposalTransport, resolveMemexProposalBinding, isProposalRequestId, MemexProposalConflict } from "@/server/mcp/memex-proposal-transport";

export type MemexProposalResult =
  | { status: "disabled" | "unconfigured" | "workspace_unbound" | "unavailable" | "outcome_unknown" | "not_found" | "conflict" }
  | { status: "received"; requestId: string; proposalId: string; proposalStatus: "proposed" | "quarantined" | "approved" | "rejected" | "publishing" | "promoted"; publicationStatus: "unknown" };
type Request = { workspaceId: string; requestId: string };
type Dependencies = { env?: () => Readonly<Record<string, string | undefined>>; transport?: typeof createMemexProposalTransport };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function receipt(raw: string, namespace: string, requestId: string): MemexProposalResult {
  const data: unknown = JSON.parse(raw);
  if (data === null) return { status: "not_found" };
  if (!object(data) || data.version !== 1 || data.namespace !== namespace || data.requestId !== requestId
    || typeof data.proposalId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.proposalId)
    || !["proposed", "quarantined", "approved", "rejected", "publishing", "promoted"].includes(String(data.status))) throw new Error("Invalid receipt");
  // Publication journal confirmation is a separate contract. Status alone is not independent proof.
  return { status: "received", requestId, proposalId: data.proposalId, proposalStatus: data.status as Extract<MemexProposalResult, { status: "received" }>["proposalStatus"], publicationStatus: "unknown" };
}

export function createMemexProposalService(deps: Dependencies = {}) {
  async function execute(input: Request & { content?: string }, submit: boolean): Promise<MemexProposalResult> {
    if (!isProposalRequestId(input.requestId) || (submit && (typeof input.content !== "string" || !input.content.trim() || input.content.length > 8000))) return { status: "unavailable" };
    const resolved = resolveMemexProposalBinding(deps.env?.() ?? process.env, input.workspaceId);
    if (resolved.status !== "ready") return { status: resolved.status };
    let transport: ReturnType<typeof createMemexProposalTransport> | undefined;
    let dispatched = false;
    try {
      transport = (deps.transport ?? createMemexProposalTransport)(resolved.binding);
      const args = { namespace: resolved.binding.namespace, requestId: input.requestId, ...(submit ? { content: input.content } : {}) };
      dispatched = submit;
      const result = receipt(await transport.callTool(submit ? "agentmemory_submit_proposal" : "agentmemory_proposal_status", args), resolved.binding.namespace, input.requestId);
      return submit && result.status === "not_found" ? { status: "outcome_unknown" } : result;
    } catch (error) {
      if (error instanceof MemexProposalConflict) return { status: "conflict" };
      return { status: dispatched ? "outcome_unknown" : "unavailable" };
    } finally { try { await transport?.close(); } catch { /* Public outcomes never contain transport details. */ } }
  }
  return {
    submitMemexProposal: (input: Request & { content: string }) => execute(input, true),
    getMemexProposalReceipt: (input: Request) => execute(input, false),
  };
}
export const { submitMemexProposal, getMemexProposalReceipt } = createMemexProposalService();
