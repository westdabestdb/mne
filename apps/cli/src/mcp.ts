import { homedir } from "node:os";
import { join } from "node:path";

/** An MCP server entry as agents expect it in their `mcpServers` map. */
export interface McpServerSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** Where `install.sh` drops the bundled proxy MCP server (no npm). */
export function mcpBundlePath(): string {
  return process.env.MNEMIA_MCP_BUNDLE ?? join(homedir(), ".mnemia", "bin", "mnemia-mcp.cjs");
}

/**
 * The Mnemia MCP server entry. Runs the self-contained bundle the installer dropped
 * (`node ~/.mnemia/bin/mnemia-mcp.cjs`) — no npm/npx. Carries NO API key and NO fixed project:
 * the key is read at runtime from ~/.mnemia/config.json (written by `mnemia auth`), so install
 * can happen BEFORE auth. The project is resolved per-repo by the server.
 */
export function mnemiaMcpSpec(apiUrl: string, actor?: string): McpServerSpec {
  const command = process.env.MNEMIA_MCP_COMMAND ?? "node";
  const args = process.env.MNEMIA_MCP_ARGS
    ? process.env.MNEMIA_MCP_ARGS.split(" ").filter(Boolean)
    : [mcpBundlePath()];
  const env: Record<string, string> = { MNEMIA_API_URL: apiUrl };
  if (actor) env.MNEMIA_ACTOR = actor;
  return { command, args, env };
}

/** Merge the Mnemia server into an agent's `mcpServers` map without clobbering others. Pure. */
export function mergeMcpConfig(existing: Record<string, unknown> | null, spec: McpServerSpec): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const servers = { ...((base.mcpServers as Record<string, unknown>) ?? {}) };
  servers.mnemia = spec;
  base.mcpServers = servers;
  return base;
}

/** VS Code uses `servers` (not `mcpServers`) and a `type` discriminator. */
export function mergeServersConfig(existing: Record<string, unknown> | null, spec: McpServerSpec): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const servers = { ...((base.servers as Record<string, unknown>) ?? {}) };
  servers.mnemia = { type: "stdio", ...spec };
  base.servers = servers;
  return base;
}
