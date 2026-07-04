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
  });
  const client = new Client({ name: "oria-hq-memex-readonly", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  return {
    async listTools() {
      const result = await client.listTools();
      return (result.tools ?? []).map((tool) => tool.name);
    },
    async callTool(name, args) {
      const result = await client.callTool({ name, arguments: args });
      if (Array.isArray(result.content)) {
        const textParts = result.content
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text);
        return textParts.join("\n");
      }
      if (typeof result.content === "string") {
        return result.content;
      }
      return JSON.stringify(result.content ?? "");
    },
    async close() {
      await client.close();
    },
  };
}
