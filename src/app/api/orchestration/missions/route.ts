import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { serverEnv } from "@/lib/server-env";
import { createPaperclipReadHandler } from "@/server/orchestration/paperclip-read-handler";

export const dynamic = "force-dynamic";

export const GET = createPaperclipReadHandler({
  authorize: requireOwnerApiSession,
  workspaceId: () => getActiveWorkspaceContext().activeWorkspace.id,
  settings: () => ({
    enabled: serverEnv.paperclipReadOnlyEnabled,
    baseUrl: serverEnv.paperclipBaseUrl,
    token: serverEnv.paperclipBoardToken,
    workspaceId: serverEnv.paperclipWorkspaceId,
    companyId: serverEnv.paperclipCompanyId,
  }),
});
