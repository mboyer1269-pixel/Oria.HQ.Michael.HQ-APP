import "server-only";
import type { MemexProposalResult } from "@/server/memory/memex-proposal-service";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json") || !request.body) throw Error("body");
  const reader = request.body.getReader(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => { const chunks: Uint8Array[] = []; let size = 0;
        while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 40000) throw Error("size"); chunks.push(part.value); }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("timeout")), 5000); }),
    ]);
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
export function createMemexProposalHandlers(deps: {
  authorize: () => Promise<Response | null>;
  workspaceId: () => string;
  publicOrigin?: () => string | undefined;
  submit: (input: { workspaceId: string; requestId: string; content: string }) => Promise<MemexProposalResult>;
  receipt: (input: { workspaceId: string; requestId: string }) => Promise<MemexProposalResult>;
}) {
  return {
    async POST(request: Request) {
      const denied = await deps.authorize(); if (denied) return denied;
      let origin = new URL(request.url).origin;
      const configured = deps.publicOrigin?.() ?? process.env.ORIA_HQ_PUBLIC_ORIGIN;
      if (configured !== undefined) {
        try {
          const parsed = new URL(configured);
          if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== configured || parsed.username || parsed.password) throw Error("origin");
          origin = parsed.origin;
        } catch { return json({ status: "request_denied" }, 403); }
      }
      if (request.headers.get("origin") !== origin || new URL(request.url).search) return json({ status: "request_denied" }, 403);
      let body: unknown; try { body = await readBody(request); } catch { return json({ status: "invalid_request" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ status: "invalid_request" }, 400);
      const value = body as Record<string, unknown>;
      if (Object.keys(value).some(key => !["requestId", "content"].includes(key)) || typeof value.requestId !== "string" || !uuid.test(value.requestId) || typeof value.content !== "string" || !value.content.trim() || value.content.length > 8000) return json({ status: "invalid_request" }, 400);
      try { return json(await deps.submit({ workspaceId: deps.workspaceId(), requestId: value.requestId, content: value.content })); }
      catch { return json({ status: "outcome_unknown" }, 503); }
    },
    async GET(request: Request) {
      const denied = await deps.authorize(); if (denied) return denied;
      const params = new URL(request.url).searchParams; const requestId = params.get("requestId");
      if (!requestId || !uuid.test(requestId) || params.getAll("requestId").length !== 1 || [...params.keys()].some(key => key !== "requestId")) return json({ status: "invalid_request" }, 400);
      try { return json(await deps.receipt({ workspaceId: deps.workspaceId(), requestId })); }
      catch { return json({ status: "unavailable" }, 503); }
    },
  };
}
