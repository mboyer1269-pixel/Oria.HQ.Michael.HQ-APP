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
  /**
   * G1: stable provider-facing idempotency key for this intent + approved
   * payload (`oria1:<workspaceId>:<intentId>:<payloadHash>`). Identical across
   * retries; never contains the per-attempt token. Tools that contact an
   * external system must send it and fail closed when it is absent.
   */
  idempotencyKey?: string;
};

/** Uniform tool result. `rateLimited` lets callers keep an intent retryable. */
export type McpToolResult = {
  ok: boolean;
  actionRef?: string;
  output?: Record<string, unknown>;
  error?: string;
  rateLimited?: boolean;
  /**
   * The request may have reached the provider (timeout / network error after
   * send). Not a proven failure: callers must not mark failed nor resend.
   */
  outcomeUncertain?: boolean;
  /** Set only by the governed dispatch when the guard refused. No effect happened. */
  refusal?: GovernedRefusal;
};

/** Structured policy refusal (no secrets, no payload content). */
export type GovernedRefusal = {
  verdict: "REQUIRE_APPROVAL" | "BLOCK";
  ruleId: string;
  ruleVersion: number;
  reason: string;
  action: string;
  intentId: string;
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
