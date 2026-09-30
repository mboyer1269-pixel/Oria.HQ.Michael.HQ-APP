import "server-only";
import path from "node:path";
import { z } from "zod";
import { isValidMemexNamespace } from "@/server/mcp/memex-bridge-contract";
import { createProjectHttpMemexTransport, resolveMemexProjectHttpBinding } from "@/server/mcp/memex-http-transport";
import { createOpenHandsMemoryAttachmentService, createOpenHandsMemoryAttachmentStore } from "./openhands-memory-attachment";
import { createOpenHandsMemorySnapshotStore } from "./openhands-memory-snapshot-store";

const id = z.string().trim().min(1).max(160);
const entrySchema = z.object({ workspaceId: id, projectId: id, label: z.string().trim().min(1).max(120),
  namespace: z.string().max(256).refine(n => isValidMemexNamespace(n) && n.startsWith("org:") && !n.startsWith("org:workspace:")),
  centerEntityId: id, endpoint: z.url().max(2048), readHandleFile: z.string().max(4096).refine(p => path.isAbsolute(p)),
}).strict();

/** Server deployment configuration only. No credentials in this JSON: file references
 * point to separately provisioned project-scoped handles. Invalid registry fails closed.
 */
export function parseOpenHandsProjectRegistry(raw: string | undefined) {
  if (!raw) return [];
  if (raw.length > 32768) throw Error("project_registry_invalid");
  const entries = z.array(entrySchema).max(20).parse(JSON.parse(raw));
  const projects = new Set<string>(), namespaces = new Set<string>();
  for (const e of entries) {
    const endpoint = new URL(e.endpoint);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/mcp"
      || !(endpoint.protocol === "https:" || (endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)))) {
      throw Error("project_registry_invalid");
    }
    const projectKey = JSON.stringify([e.workspaceId, e.projectId]);
    const namespaceKey = JSON.stringify([endpoint.href, e.namespace]);
    if (projects.has(projectKey) || namespaces.has(namespaceKey)) throw Error("project_registry_ambiguous");
    projects.add(projectKey); namespaces.add(namespaceKey);
  }
  return entries;
}

export function listOpenHandsMemoryProjects(workspaceId: string) {
  return parseOpenHandsProjectRegistry(process.env.ORIA_MEMEX_PROJECT_BINDINGS).filter(e => e.workspaceId === workspaceId)
    .map(({projectId, label}) => ({projectId, label}));
}

/** Composes real durable stores and HTTP transport; no local runtime-memory fallback. */
export async function attachConfiguredOpenHandsMemory(context: {workspaceId: string; actorId: string}, request: unknown) {
  try {
    // Read once so registry changes cannot swap bindings within this operation.
    const entries = parseOpenHandsProjectRegistry(process.env.ORIA_MEMEX_PROJECT_BINDINGS);
    const store = createOpenHandsMemoryAttachmentStore(), snapshots = createOpenHandsMemorySnapshotStore();
    if (!store || !snapshots) return {status:"unavailable", externalEffectAllowed:false};
    const service = createOpenHandsMemoryAttachmentService({store, snapshots,
      resolveProjectBinding: async (workspaceId, projectId) => {
        const entry = entries.find(e => e.workspaceId === workspaceId && e.projectId === projectId);
        return entry ? {workspaceId, projectId, namespace:entry.namespace, centerEntityId:entry.centerEntityId, namespaceScope:"project"} : null;
      },
      createTransport: async binding => {
        const entry = entries.find(e => e.workspaceId === binding.workspaceId && e.projectId === binding.projectId);
        if (!entry) throw Error("project_unbound");
        const resolved = resolveMemexProjectHttpBinding({
          ORIA_ENABLE_MEMEX_HTTP_READONLY: "1", MEMEX_HTTP_HQ_WORKSPACE_ID: binding.workspaceId,
          MEMEX_HTTP_ENDPOINT: entry.endpoint, MEMEX_HTTP_READ_HANDLE_FILE: entry.readHandleFile,
        }, binding.workspaceId, binding.namespace);
        if (resolved.status !== "ready") throw Error("project_memory_unavailable");
        return createProjectHttpMemexTransport(resolved.binding);
      },
    });
    return await service(context, request);
  } catch { return {status:"unavailable", externalEffectAllowed:false}; }
}
