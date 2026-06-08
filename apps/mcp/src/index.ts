#!/usr/bin/env node
// @mnemia/mcp — STDIO MCP server for the hosted Mnemia API. Generic: any MCP client.
//
// Point any agent at this binary with the SAME credential and they share memory:
//   command: node ~/.mnemia/bin/mnemia-mcp.cjs
//   env: MNEMIA_API_URL=http://localhost:8787   (MNEMIA_API_KEY optional — acquired via the
//        in-agent `mne_authenticate` browser flow on first use)
//
// THIS build wires authentication (browser approval → minted key bound to a web account) and the
// project plane. Memory tools are registered but stubbed; the engine migrates in next.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { makeBackend } from "./backend.js";

export { buildServer } from "./server.js";
export { makeBackend, ProxyBackend, identityFromEnv } from "./backend.js";

async function main(): Promise<void> {
  const server = buildServer(makeBackend());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error(`mnemia-mcp ready → ${process.env.MNEMIA_API_URL ?? "http://localhost:8787"}`);
}

if (process.env.NODE_ENV !== "test") {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("mnemia-mcp fatal:", e);
    process.exit(1);
  });
}
