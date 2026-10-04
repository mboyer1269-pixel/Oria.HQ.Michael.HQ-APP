import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { submitMemexProposal, getMemexProposalReceipt } from "@/server/memory/memex-proposal-service";
import { createMemexProposalHandlers } from "./handlers";
export const dynamic = "force-dynamic";
export const { POST, GET } = createMemexProposalHandlers({ authorize: requireOwnerApiSession,
  workspaceId: () => getActiveWorkspaceContext().workspace.id, submit: submitMemexProposal, receipt: getMemexProposalReceipt });
