import { requireOwnerApiSession, getAuthenticatedActorId } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { serverEnv } from "@/lib/server-env";
import { createPaperclipDispatchHandler } from "@/server/orchestration/paperclip-dispatch";
import { createDurablePaperclipDispatchStore } from "@/server/orchestration/paperclip-dispatch-store";

export const dynamic = "force-dynamic";
export const POST = createPaperclipDispatchHandler({
  authorize: requireOwnerApiSession, actorId: getAuthenticatedActorId,
  workspaceId: () => getActiveWorkspaceContext().activeWorkspace.id,
  enabled: () => serverEnv.paperclipDispatchEnabled,
  settings: () => ({ enabled: serverEnv.paperclipDispatchEnabled, baseUrl: serverEnv.paperclipBaseUrl,
    token: serverEnv.paperclipBoardToken, workspaceId: serverEnv.paperclipWorkspaceId, companyId: serverEnv.paperclipCompanyId }),
  store: createDurablePaperclipDispatchStore,
});
