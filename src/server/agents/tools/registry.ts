// MCP Tool Registry -- the in-process catalog of agent tools.
//
// A tiny, deterministic registry: register on module load, look up by name,
// list definitions for discovery. The singleton is pre-seeded with the first
// tool (n8n_webhook_trigger). This is the foundation an external MCP server can
// later wrap to advertise/execute these tools over the wire.

import type { McpTool, McpToolDefinition } from "./types";
import { toMcpToolDefinition } from "./types";
import { marketplaceCatalogBrowseTool } from "./marketplace-catalog-browse";
import { n8nWebhookTriggerTool } from "./n8n-webhook-trigger";

export class McpToolRegistry {
  private readonly tools = new Map<string, McpTool>();

  register(tool: McpTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`MCP tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): McpTool | null {
    return this.tools.get(name) ?? null;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): McpTool[] {
    return [...this.tools.values()];
  }

  listDefinitions(): McpToolDefinition[] {
    return this.list().map(toMcpToolDefinition);
  }
}

// The process-wide registry. Pre-seeded with the sanctioned tools.
export const mcpToolRegistry = new McpToolRegistry();
mcpToolRegistry.register(n8nWebhookTriggerTool);
mcpToolRegistry.register(marketplaceCatalogBrowseTool);
