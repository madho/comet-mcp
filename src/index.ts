#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep the process alive; the transport owns stdin/stdout.
}

main().catch((error) => {
  // stderr is safe: stdout is reserved for the MCP JSON-RPC stream.
  console.error("comet-mcp failed to start:", error);
  process.exit(1);
});
