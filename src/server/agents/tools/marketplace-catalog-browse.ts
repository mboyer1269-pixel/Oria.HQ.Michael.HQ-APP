// MCP tool: marketplace_catalog_browse
//
// Read-only browse of the static marketplace catalog. No network, no OAuth,
// no enable/install/execute. Studio and agents may discover tool shapes;
// Sentinelle + CEO still gate any real action.

import { z } from "zod";
import { browseMarketplaceCatalog } from "@/server/agents/marketplace/marketplace-catalog";
import type { McpTool, McpToolContext, McpToolResult } from "./types";

export const MARKETPLACE_CATALOG_BROWSE_TOOL_NAME = "marketplace_catalog_browse";

export const marketplaceCatalogBrowseInputSchema = z
  .object({
    query: z.string().max(120).optional(),
    excludeSpend: z.boolean().optional(),
    readOnlyOnly: z.boolean().optional(),
  })
  .strict();

async function browseCatalog(rawInput: unknown, ctx: McpToolContext): Promise<McpToolResult> {
  const parsed = marketplaceCatalogBrowseInputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, error: "Invalid marketplace_catalog_browse payload." };
  }

  const snapshot = browseMarketplaceCatalog({
    query: parsed.data.query,
    excludeSpend: parsed.data.excludeSpend,
    readOnlyOnly: parsed.data.readOnlyOnly,
  });

  return {
    ok: true,
    actionRef: `marketplace_browse_${ctx.workspaceId}_${snapshot.generatedAtIso}`,
    output: {
      source: snapshot.source,
      browseIsReadOnly: snapshot.browseIsReadOnly,
      liveOAuthAttached: snapshot.liveOAuthAttached,
      generatedAtIso: snapshot.generatedAtIso,
      entryCount: snapshot.entries.length,
      entries: snapshot.entries.map((e) => ({
        toolId: e.toolId,
        label: e.label,
        trustLevel: e.trustLevel,
        mutatesExternalState: e.mutatesExternalState,
        canSpend: e.canSpend,
      })),
      note: "Static seed catalog — no live OAuth. Enable/execute remain CEO-gated.",
    },
  };
}

export const marketplaceCatalogBrowseTool: McpTool = {
  name: MARKETPLACE_CATALOG_BROWSE_TOOL_NAME,
  description:
    "Browse the static Oria marketplace catalog (read-only dry-run). " +
    "Does not connect OAuth, enable tools, or execute actions.",
  inputSchema: marketplaceCatalogBrowseInputSchema,
  handler: browseCatalog,
};
