// src/server/mcp/memex-stdio-transport.ts
//
// Controlled stdio transport to a local Memex Core MCP server.
// Only invoked when resolveMemexExecutionEnvironment() allows spawn.
// No shell, fixed command line, no user-controlled args.

import path from "node:path";

import type { MemexMcpTransport } from "@/server/mcp/memex-readonly-client";

export type CreateStdioMemexTransportOptions = {
  memexCoreRoot: string;
};

/** Protocol errors must never become memory evidence, even when they contain text. */
export function readMemexToolText(result: unknown): string {
  if (result === null || typeof result !== "object") {
    throw new Error("Memex returned an unsupported response");
  }
  const response = result as Record<string, unknown>;
  if (response.isError) {
    throw new Error("Memex rejected the read request");
  }
  if (!Array.isArray(response.content)) {
    throw new Error("Memex returned an unsupported response");
  }
  const parts = response.content.filter(
    (part): part is { type: "text"; text: string } =>
      part !== null && typeof part === "object" && part.type === "text" && typeof part.text === "string",
  );
  return parts.map((part) => part.text).join("\n");
}

/**
 * Spawns Memex Core's stdio MCP entrypoint via the official MCP SDK.
 * Command: `node --experimental-strip-types <memex-core>/src/mcp/server.ts`
 */
export async function createStdioMemexTransport(
  options: CreateStdioMemexTransportOptions,
): Promise<MemexMcpTransport> {
  const serverEntry = path.join(options.memexCoreRoot, "src", "mcp", "server.ts");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--experimental-strip-types", serverEntry],
    cwd: options.memexCoreRoot,
    env: { AGENTMEMORY_ACCESS: "read_only" },
  });
  const client = new Client({ name: "oria-hq-memex-readonly", version: "0.1.0" }, { capabilities: {} });
  try {
    await client.connect(transport, { timeout: 5_000 });
  } catch (error) {
    await transport.close().catch(() => {});
    throw error;
  }

  return {
    async listTools() {
      const result = await client.listTools();
      return (result.tools ?? []).map((tool) => tool.name);
    },
    async callTool(name, args) {
      const result = await client.callTool({ name, arguments: args });
      return readMemexToolText(result);
    },
    async close() {
      await client.close();
    },
  };
}
