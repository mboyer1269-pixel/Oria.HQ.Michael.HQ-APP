import { NextResponse } from "next/server";
import { isSubscriptionOwner } from "@/server/ai/subscription-owner";
import { readSubscriptionQuota, type QuotaOptions } from "@/server/ai/subscription-quota";

export type QuotaCtx = { userId: string; role?: string };
/** Usage of a PERSONAL subscription: workspace owner AND subscription owner only (same rule as Atelier mutations). */
export function subscriptionQuotaResponse(ctx: QuotaCtx, opts: QuotaOptions = {}, env: NodeJS.ProcessEnv = process.env) {
  if (ctx.role !== "owner") return NextResponse.json({ error: "Action réservée au propriétaire de l'espace.", code: "quota_owner_only" }, { status: 403 });
  if (!isSubscriptionOwner(ctx.userId, env)) return NextResponse.json({ error: "Abonnement CLI réservé à son titulaire.", code: "subscription_owner_only" }, { status: 403 });
  return NextResponse.json(readSubscriptionQuota({ env, ...opts }), { headers: { "cache-control": "no-store" } });
}
