import "server-only";
import { resolveMemexHttpBinding, createHttpMemexTransport } from "@/server/mcp/memex-http-transport";
import type { MemexMcpTransport } from "@/server/mcp/memex-readonly-client";
import { redactMemoryText } from "@/server/agents/evidence/memory-evidence-pack";
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const clean = (v: unknown, limit: number) => typeof v === "string" ? redactMemoryText(v.slice(0, limit)).text : null;
export function createMemorySearchHandler(deps: {
  authorize: () => Promise<Response | null>;
  workspaceId: () => string;
  env?: () => Readonly<Record<string, string | undefined>>;
  transport?: (binding: Parameters<typeof createHttpMemexTransport>[0]) => MemexMcpTransport;
}) {
  return async (request: Request) => {
    const denied = await deps.authorize(); if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim() ?? "";
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (query.length > 200 || [...params.keys()].some(key => key !== "q") || params.getAll("q").length > 1) return reply({ status: "invalid_request" }, 400);
    const binding = resolveMemexHttpBinding(deps.env?.() ?? process.env, deps.workspaceId());
    if (binding.status !== "ready") return reply({ status: binding.status, records: [] });
    let transport: MemexMcpTransport | undefined;
    try {
      transport = (deps.transport ?? createHttpMemexTransport)(binding.binding);
      if (!(await transport.listTools()).includes("agentmemory_graph_query")) throw new Error("tool unavailable");
      const raw: unknown = JSON.parse(await transport.callTool("agentmemory_graph_query", { namespace: binding.binding.namespace, limit: 50 }));
      if (!Array.isArray(raw) || raw.length > 50 || raw.some(row => !object(row) || typeof row.id !== "string" || row.id.length > 300 || row.namespace !== binding.binding.namespace || typeof row.type !== "string" || (row.properties != null && !object(row.properties)))) throw new Error("invalid records");
      const records = raw.map(row => ({
        id: clean(row.id, 300), type: clean(row.type, 100), title: clean(row.name, 200),
        content: clean(row.properties?.content, 4000),
        provenance: typeof row.source === "string" && (/^(?:[A-Za-z]:[\\/]|\/|file:)/.test(row.source) || /^https?:/i.test(row.source)) ? "Référence interne non exposée" : clean(row.source, 500),
        confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 1 ? row.confidence : null,
        updatedAt: typeof row.updatedAt === "string" && Number.isFinite(Date.parse(row.updatedAt)) ? new Date(row.updatedAt).toISOString() : null,
      })).filter(row => !query || `${row.title ?? ""} ${row.content ?? ""} ${row.type ?? ""}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
      return reply({ status: "ready", records, sampled: raw.length, limit: 50, verification: "not_independently_verified" });
    } catch { return reply({ status: "unavailable", records: [] }, 503); }
    finally { try { await transport?.close(); } catch { /* No internal details in public response. */ } }
  };
}
