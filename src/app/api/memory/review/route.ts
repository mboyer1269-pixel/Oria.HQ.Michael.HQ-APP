import { getCurrentAuthUser, isOwnerUser } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { reviewMemexProposal } from "@/server/memory/memex-review-service";
import { createReviewHandler } from "./handler";
export const dynamic="force-dynamic";
export const POST=createReviewHandler({authenticate:async()=>{
 const user=await getCurrentAuthUser();
 if(!user)return Response.json({status:"unauthenticated"},{status:401});
 if(!isOwnerUser(user))return Response.json({status:"forbidden"},{status:403});
 return {reviewerId:user.id};
},workspaceId:()=>getActiveWorkspaceContext().workspace.id,publicOrigin:()=>process.env.ORIA_HQ_PUBLIC_ORIGIN,review:reviewMemexProposal});
