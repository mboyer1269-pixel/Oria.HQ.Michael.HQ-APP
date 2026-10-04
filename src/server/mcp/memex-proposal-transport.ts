import "server-only";
import { readConfiguredHandle } from "./memex-http-transport";
import { createMemexHttpRpc, MemexHttpError } from "./memex-http-rpc";
import { workspaceIdToMemexNamespace } from "./memex-readonly-client";

type Environment = Readonly<Record<string, string | undefined>>;
export type ProposalBinding = { endpoint: string; handle: string; namespace: string; workspaceId: string };
type BindingResult = { status: "ready"; binding: ProposalBinding } | { status: "disabled" | "unconfigured" | "workspace_unbound" };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export const isProposalRequestId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export class MemexProposalConflict extends Error { constructor() { super("Memex proposal conflict"); } }

/** Separate opt-in and credential; never widen the Joris read corridor. */
export function resolveMemexProposalBinding(env: Environment, workspaceId: string): BindingResult {
  if (env.ORIA_ENABLE_MEMEX_PROPOSALS !== "1") return { status: "disabled" };
  if (!env.MEMEX_HTTP_HQ_WORKSPACE_ID || !env.MEMEX_HTTP_ENDPOINT || (!env.MEMEX_HTTP_PROPOSAL_HANDLE && !env.MEMEX_HTTP_PROPOSAL_HANDLE_FILE)) return { status: "unconfigured" };
  if (env.MEMEX_HTTP_HQ_WORKSPACE_ID !== workspaceId) return { status: "workspace_unbound" };
  try {
    const endpoint = new URL(env.MEMEX_HTTP_ENDPOINT);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/mcp"
      || !(endpoint.protocol === "https:" || (endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)))) return { status: "unconfigured" };
    const handle = readConfiguredHandle({ MEMEX_HTTP_READ_HANDLE: env.MEMEX_HTTP_PROPOSAL_HANDLE, MEMEX_HTTP_READ_HANDLE_FILE: env.MEMEX_HTTP_PROPOSAL_HANDLE_FILE });
    if (handle.length > 8192 || !/^amh1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(handle)) return { status: "unconfigured" };
    const payload: unknown = JSON.parse(Buffer.from(handle.split(".")[1], "base64url").toString("utf8"));
    const namespace = workspaceIdToMemexNamespace(workspaceId);
    if (!object(payload) || payload.access !== "read_write" || typeof payload.sub !== "string" || !payload.sub
      || typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000
      || !Array.isArray(payload.namespaces) || payload.namespaces.length !== 1 || payload.namespaces[0] !== namespace) return { status: "unconfigured" };
    return { status: "ready", binding: { endpoint: endpoint.href, handle, namespace, workspaceId } };
  } catch { return { status: "unconfigured" }; }
}

export function createMemexProposalTransport(binding: ProposalBinding, fetcher: typeof fetch = fetch) {
  const config = resolveMemexProposalBinding({ ORIA_ENABLE_MEMEX_PROPOSALS: "1", MEMEX_HTTP_HQ_WORKSPACE_ID: binding.workspaceId,
    MEMEX_HTTP_ENDPOINT: binding.endpoint, MEMEX_HTTP_PROPOSAL_HANDLE: binding.handle }, binding.workspaceId);
  if (config.status !== "ready" || config.binding.namespace !== binding.namespace) throw new MemexHttpError("scope_denied");
  const wire = createMemexHttpRpc(config.binding.endpoint, config.binding.handle, fetcher);
  return {
    async callTool(name: "agentmemory_submit_proposal" | "agentmemory_proposal_status", args: Record<string, unknown>): Promise<string> {
      if (!["agentmemory_submit_proposal", "agentmemory_proposal_status"].includes(name) || args.namespace !== config.binding.namespace || !isProposalRequestId(args.requestId)) throw new MemexHttpError("scope_denied");
      const allowed = name === "agentmemory_submit_proposal" ? ["namespace", "requestId", "content"] : ["namespace", "requestId"];
      if (Object.keys(args).some(key => !allowed.includes(key)) || (name === "agentmemory_submit_proposal" && (typeof args.content !== "string" || !args.content.trim() || args.content.length > 8000))) throw new MemexHttpError("scope_denied");
      const result = await wire.rpc("tools/call", { name, arguments: { ...args, namespace: config.binding.namespace,
        ...(name === "agentmemory_submit_proposal" ? { tenant: config.binding.namespace } : {}) } });
      if (object(result) && result.isError === true && Array.isArray(result.content) && result.content.length === 1
        && object(result.content[0]) && result.content[0].type === "text" && typeof result.content[0].text === "string") {
        let failure: unknown;
        try { failure = JSON.parse(result.content[0].text); } catch { /* Unknown errors remain ambiguous. */ }
        if (object(failure) && Object.keys(failure).length === 1 && Array.isArray(failure.warnings)
          && failure.warnings.length === 1 && failure.warnings[0] === "Submission request conflict") throw new MemexProposalConflict();
      }
      if (!object(result) || result.isError || !Array.isArray(result.content) || result.content.length !== 1 || !object(result.content[0]) || result.content[0].type !== "text" || typeof result.content[0].text !== "string") throw new MemexHttpError("invalid_response");
      return result.content[0].text;
    },
    close: wire.close,
  };
}
