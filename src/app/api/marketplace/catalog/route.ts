import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { browseMarketplaceCatalog } from "@/server/agents/marketplace/marketplace-catalog";

// GET /api/marketplace/catalog — static dry-run browse. No OAuth, no network.

export async function GET(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? undefined;
  const readOnlyOnly = url.searchParams.get("readOnlyOnly") === "1";
  const excludeSpend = url.searchParams.get("includeSpend") !== "1";

  const snapshot = browseMarketplaceCatalog({
    query,
    readOnlyOnly,
    excludeSpend,
  });

  return NextResponse.json({
    ...snapshot,
    note: "Static seed catalog — browseIsReadOnly. No live marketplace OAuth.",
  });
}
