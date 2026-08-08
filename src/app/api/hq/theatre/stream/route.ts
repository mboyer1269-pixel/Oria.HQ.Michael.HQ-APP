import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import {
  THEATRE_POLL_INTERVAL_MS,
  encodeTheatreSse,
  formatTheatreSseComment,
  type TheatreSseEvent,
} from "@/features/hq/theatre/theatre-events";
import {
  diffTheatreSnapshots,
  loadTheatrePollSnapshot,
  type TheatrePollSnapshot,
} from "@/server/hq/theatre-stream";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hq/theatre/stream?workspaceId=<id>
 *
 * Owner-gated SSE feed for the Command Tower Execution Theatre.
 * Polls existing read repositories (ledger + pending intents) scoped to the
 * active workspace. Does NOT use browser Supabase Realtime — those tables are
 * service-role-only under RESTRICTIVE RLS, so the server bridges truth over SSE.
 */
export async function GET(request: Request) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const ctx = getActiveWorkspaceContext();
  const url = new URL(request.url);
  const requestedWorkspaceId = url.searchParams.get("workspaceId")?.trim() ?? "";

  if (!requestedWorkspaceId) {
    return new Response(JSON.stringify({ error: "workspaceId query parameter is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Sovereignty gate: never stream another workspace's theatre.
  if (requestedWorkspaceId !== ctx.workspace.id) {
    logger.warn("hq.theatre.stream.workspace_mismatch", {
      requestedWorkspaceId,
      activeWorkspaceId: ctx.workspace.id,
    });
    return new Response(JSON.stringify({ error: "workspaceId does not match active workspace." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const workspaceId = ctx.workspace.id;
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let previous: TheatrePollSnapshot | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const shutdown = () => {
        closed = true;
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Register before any await — an already-aborted signal never fires later.
      if (request.signal.aborted) {
        shutdown();
        return;
      }
      request.signal.addEventListener("abort", shutdown, { once: true });

      const push = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          shutdown();
        }
      };

      const pushEvent = (event: TheatreSseEvent) => {
        push(encodeTheatreSse(event));
      };

      const tick = async () => {
        if (closed) return;
        try {
          const snapshot = await loadTheatrePollSnapshot(workspaceId);
          if (closed) return;
          const emittedAt = new Date().toISOString();
          const events = diffTheatreSnapshots(previous, snapshot, emittedAt);
          for (const event of events) {
            pushEvent(event);
          }
          previous = snapshot;
          pushEvent({ type: "heartbeat", emittedAt });
        } catch (error) {
          logger.error("hq.theatre.stream.tick_failed", {
            workspaceId,
            reason: error instanceof Error ? error.message : "unknown",
          });
          try {
            pushEvent({
              type: "error",
              message: "Theatre poll failed.",
              emittedAt: new Date().toISOString(),
            });
          } catch {
            shutdown();
          }
        }
      };

      pushEvent({
        type: "hello",
        workspaceId,
        emittedAt: new Date().toISOString(),
      });
      push(formatTheatreSseComment("oria-theatre-sse"));

      await tick();
      if (closed) return;
      timer = setInterval(() => {
        void tick();
      }, THEATRE_POLL_INTERVAL_MS);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
