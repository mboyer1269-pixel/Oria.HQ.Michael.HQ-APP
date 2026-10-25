import { NonRetriableError } from "inngest";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { inngest } from "./inngest-client";
import type { CommandResult } from "@/core/types";

// ---------------------------------------------------------------------------
// Joris Execute Job — background job for long-running Joris brain invocations.
//
// CURRENT STATE: This job wraps runJorisCommand() as a detached background
// task. The /api/joris/chat route currently calls runJorisCommand() synchronously
// because all intent handlers are deterministic (no real LLM calls yet).
//
// MIGRATION PATH: When real LLM inference is added to brain.ts (board.consult,
// opportunity.score, etc.), migrate the heavy path to send an Inngest event
// and return 202 Accepted immediately. The job will persist the result to
// Supabase, and the client will poll for completion.
//
// EVENT SCHEMA: { workspaceId, userId, message, locale }
// ---------------------------------------------------------------------------

export type JorisExecuteEventData = {
  workspaceId: string;
  userId: string;
  message: string;
  locale: "fr-CA";
};

/**
 * The only sanctioned way to build a `joris/execute` event. Identity and
 * workspace come exclusively from the server-resolved session context
 * (`requireWorkspaceApiSession`), never from a request body; the job re-checks
 * membership on receipt. No emitter exists yet (the chat route is synchronous).
 */
export function buildJorisExecuteEvent(
  session: { ctx: { userId: string; workspaceId: string } },
  message: string,
): { name: "joris/execute"; data: JorisExecuteEventData } {
  if (!session?.ctx?.userId || !session.ctx.workspaceId) throw new Error("Missing server session context");
  return { name: "joris/execute", data: { userId: session.ctx.userId, workspaceId: session.ctx.workspaceId, message, locale: "fr-CA" } };
}

export function resolveJorisJobContext(data: JorisExecuteEventData) {
  try {
    if (!data.userId || !data.workspaceId) throw new Error("Missing job authorization context");
    return getActiveWorkspaceContext({ userId: data.userId, workspaceId: data.workspaceId });
  } catch (error) {
    throw new NonRetriableError(error instanceof Error ? error.message : "Invalid job authorization context");
  }
}

export const jorisExecuteJob = inngest.createFunction(
  {
    id: "joris-execute",
    name: "Joris — Execute Command",
    retries: 2,
    // Timeout covers long LLM chains (board.consult, multi-step agents).
    // Vercel Pro allows 300s; Hobby is 60s. Inngest detaches from the HTTP layer.
    timeouts: { finish: "5m" },
  },
  { event: "joris/execute" },
  async ({ event, step }): Promise<CommandResult> => {
    const workspaceContext = resolveJorisJobContext(event.data);
    // Import lazily to avoid circular dependencies during build.
    const { runJorisCommand } = await import("@/server/joris/brain");

    const result = await step.run("run-joris-command", async () => {
      return runJorisCommand(event.data.message, workspaceContext);
    });

    return result;
  },
);
