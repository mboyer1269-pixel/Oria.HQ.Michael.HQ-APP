import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createMemexHttpRpc, MemexHttpError } from "./memex-http-rpc";
export { MemexHttpError } from "./memex-http-rpc";
import { isMemexReadToolPermitted, workspaceIdToMemexNamespace, type MemexMcpTransport } from "./memex-readonly-client";
import { isValidMemexNamespace } from "./memex-bridge-contract";

type Environment = Readonly<Record<string, string | undefined>>;
export type MemexHttpBinding = { endpoint: string; readHandle: string; workspaceId: string; namespace: string };
type BindingResult = { status: "ready"; binding: MemexHttpBinding } | { status: "disabled" | "unconfigured" | "workspace_unbound" };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function readConfiguredHandle(env: Environment): string {
  const filename = env.MEMEX_HTTP_READ_HANDLE_FILE;
  if (!filename) return env.MEMEX_HTTP_READ_HANDLE ?? "";
  // Exactly one secret source. Reopen on each request so atomic rotation needs no restart.
  if (env.MEMEX_HTTP_READ_HANDLE || !path.isAbsolute(filename) || fs.lstatSync(filename).isSymbolicLink()) throw new Error("Invalid secret source");
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 8192) throw new Error("Invalid secret file");
    const buffer = Buffer.alloc(8193);
    const size = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (size > 8192) throw new Error("Invalid secret file");
    return buffer.subarray(0, size).toString("utf8").trim();
  } finally { fs.closeSync(fd); }
}

/** Payload inspection narrows configuration; only Memex verifies its signature. */
export function resolveMemexHttpBinding(env: Environment, workspaceId: string): BindingResult {
  return resolveNamespaceBinding(env, workspaceId, workspaceIdToMemexNamespace(workspaceId));
}

/** Namespace must come from the authenticated server project registry, not a request body.
 * A separate single-namespace handle is required; workspace handles cannot be widened.
 */
export function resolveMemexProjectHttpBinding(env: Environment, workspaceId: string, namespace: string): BindingResult {
  if (!isValidMemexNamespace(namespace) || !namespace.startsWith("org:") || namespace.startsWith("org:workspace:")) {
    return { status: "unconfigured" };
  }
  return resolveNamespaceBinding(env, workspaceId, namespace);
}

function resolveNamespaceBinding(env: Environment, workspaceId: string, namespace: string): BindingResult {
  if (env.ORIA_ENABLE_MEMEX_HTTP_READONLY !== "1") return { status: "disabled" };
  if (!env.MEMEX_HTTP_HQ_WORKSPACE_ID || !env.MEMEX_HTTP_ENDPOINT || (!env.MEMEX_HTTP_READ_HANDLE && !env.MEMEX_HTTP_READ_HANDLE_FILE)) return { status: "unconfigured" };
  if (env.MEMEX_HTTP_HQ_WORKSPACE_ID !== workspaceId) return { status: "workspace_unbound" };
  try {
    const endpoint = new URL(env.MEMEX_HTTP_ENDPOINT);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/mcp"
      || !(endpoint.protocol === "https:" || (endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)))) return { status: "unconfigured" };
    const readHandle = readConfiguredHandle(env);
    if (readHandle.length > 8192 || !/^amh1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(readHandle)) return { status: "unconfigured" };
    const payload: unknown = JSON.parse(Buffer.from(readHandle.split(".")[1], "base64url").toString("utf8"));
    if (!object(payload) || payload.access !== "read_only" || typeof payload.sub !== "string" || !payload.sub
      || typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000
      || !Array.isArray(payload.namespaces) || payload.namespaces.length !== 1 || payload.namespaces[0] !== namespace) return { status: "unconfigured" };
    return { status: "ready", binding: { endpoint: endpoint.href, readHandle, workspaceId, namespace } };
  } catch { return { status: "unconfigured" }; }
}

/** Fixed stateless JSON-RPC subset of Memex POST /mcp. No redirects, retries or SSE. */
export function createHttpMemexTransport(options: MemexHttpBinding, fetcher: typeof fetch = fetch): MemexMcpTransport {
  const binding = { ...options };
  const resolved = resolveMemexHttpBinding({ ORIA_ENABLE_MEMEX_HTTP_READONLY: "1", MEMEX_HTTP_HQ_WORKSPACE_ID: binding.workspaceId,
    MEMEX_HTTP_ENDPOINT: binding.endpoint, MEMEX_HTTP_READ_HANDLE: binding.readHandle }, binding.workspaceId);
  if (resolved.status !== "ready" || resolved.binding.namespace !== binding.namespace) throw new MemexHttpError("scope_denied");
  return createBoundTransport(binding, fetcher, false);
}

/** Project transport exposes context_pack only. It never reads local AgentMemory. */
export function createProjectHttpMemexTransport(options: MemexHttpBinding, fetcher: typeof fetch = fetch): MemexMcpTransport {
  const binding = { ...options };
  const resolved = resolveMemexProjectHttpBinding({ ORIA_ENABLE_MEMEX_HTTP_READONLY: "1", MEMEX_HTTP_HQ_WORKSPACE_ID: binding.workspaceId,
    MEMEX_HTTP_ENDPOINT: binding.endpoint, MEMEX_HTTP_READ_HANDLE: binding.readHandle }, binding.workspaceId, binding.namespace);
  if (resolved.status !== "ready") throw new MemexHttpError("scope_denied");
  return createBoundTransport(binding, fetcher, true);
}

function createBoundTransport(binding: MemexHttpBinding, fetcher: typeof fetch, projectOnly: boolean): MemexMcpTransport {
  const permitted = (name: string) => projectOnly ? name === "agentmemory_context_pack" : isMemexReadToolPermitted(name);
  const { rpc, close } = createMemexHttpRpc(binding.endpoint, binding.readHandle, fetcher);
  return {
    async listTools() {
      const result = await rpc("tools/list");
      if (!object(result) || !Array.isArray(result.tools) || result.tools.length > 100 || result.tools.some(tool => !object(tool) || typeof tool.name !== "string")) throw new MemexHttpError("invalid_response");
      return result.tools.map(tool => (tool as { name: string }).name).filter(permitted);
    },
    async callTool(name, args) {
      if (!permitted(name) || args.namespace !== binding.namespace) throw new MemexHttpError("scope_denied");
      const result = await rpc("tools/call", { name, arguments: { ...args, namespace: binding.namespace } });
      if (!object(result) || result.isError || !Array.isArray(result.content) || result.content.length === 0
        || result.content.some(part => !object(part) || part.type !== "text" || typeof part.text !== "string")) throw new MemexHttpError("invalid_response");
      return result.content.map(part => (part as { text: string }).text).join("\n");
    },
    close,
  };
}
