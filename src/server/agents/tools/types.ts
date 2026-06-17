// MCP Tool Registry -- shared types.
//
// A minimal, MCP-compatible tool contract for Oria agents. A tool has a name,
// a human description, a Zod input schema (the strict payload contract), and a
// handler that performs the side effect. `toMcpToolDefinition` projects a tool
// to the JSON-Schema shape an external MCP server would advertise, so this
// registry can later be exposed over the wire without changing tool code.
//
// Tools are the ONLY sanctioned place for an agent-driven side effect. The first
// tool, n8n_webhook_trigger, is the single outbound network chokepoint toward
// the n8n execution layer.

import { z } from "zod";

/** Optional injectable dependencies (testing / alternate runtimes). */
export type McpToolDeps = {
  fetchImpl?: typeof fetch;
  isAllowed?: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  now?: () => number;
};

/** Per-call context: the workspace scope plus optional injected deps. */
export type McpToolContext = {
  workspaceId: string;
  agentId?: string;
  deps?: McpToolDeps;
};

/** Uniform tool result. `rateLimited` lets callers keep an intent retryable. */
export type McpToolResult = {
  ok: boolean;
  actionRef?: string;
  output?: Record<string, unknown>;
  error?: string;
  rateLimited?: boolean;
};

/** A registered MCP-compatible tool. The handler validates its own input. */
export type McpTool = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (input: unknown, ctx: McpToolContext) => Promise<McpToolResult>;
};

/** MCP discovery shape: name + description + JSON-Schema input contract. */
export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/** Project a tool to the JSON-Schema definition an MCP server would advertise. */
export function toMcpToolDefinition(tool: McpTool): McpToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema) as Record<string, unknown>,
  };
}
