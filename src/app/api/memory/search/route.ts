import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { createMemorySearchHandler } from "./search-handler";
export const dynamic = "force-dynamic";
export const GET = createMemorySearchHandler({ authorize: requireOwnerApiSession, workspaceId: () => getActiveWorkspaceContext().workspace.id });
