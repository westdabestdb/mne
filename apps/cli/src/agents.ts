import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

/**
 * Agent registry — what we can install Mnemia into, where each keeps its MCP config, and in
 * which format. Detection scans the filesystem (a dir or binary present → the agent is installed).
 *
 * Formats:
 *   - json-mcpServers : { "mcpServers": { "mnemia": {command,args,env} } }   (most agents)
 *   - json-servers    : { "servers": { "mnemia": {type:"stdio",command,args,env} } }  (VS Code)
 *   - toml-codex      : [mcp_servers.mnemia] + [mcp_servers.mnemia.env]      (Codex)
 */
export type ConfigFormat = "json-mcpServers" | "json-servers" | "toml-codex";

export interface AgentDef {
  id: string;
  label: string;
  format: ConfigFormat;
  detect(home: string): boolean;
  configPath(home: string): string;
}

function binOnPath(name: string): boolean {
  const dirs = (process.env.PATH ?? "").split(":");
  return dirs.some((d) => d && existsSync(join(d, name)));
}

export const AGENTS: AgentDef[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    format: "json-mcpServers",
    detect: (home) => existsSync(join(home, ".claude")) || existsSync(join(home, ".claude.json")) || binOnPath("claude"),
    configPath: (home) => join(home, ".claude.json"),
  },
  {
    id: "cursor",
    label: "Cursor",
    format: "json-mcpServers",
    detect: (home) => existsSync(join(home, ".cursor")),
    configPath: (home) => join(home, ".cursor", "mcp.json"),
  },
  {
    id: "windsurf",
    label: "Windsurf",
    format: "json-mcpServers",
    detect: (home) => existsSync(join(home, ".codeium", "windsurf")),
    configPath: (home) => join(home, ".codeium", "windsurf", "mcp_config.json"),
  },
  {
    id: "codex",
    label: "Codex",
    format: "toml-codex",
    detect: (home) => existsSync(join(home, ".codex")) || binOnPath("codex"),
    configPath: (home) => join(home, ".codex", "config.toml"),
  },
  {
    id: "vscode",
    label: "VS Code",
    format: "json-servers",
    detect: (home) => existsSync(join(home, ".vscode")) || binOnPath("code"),
    configPath: (home) => join(home, ".vscode", "mcp.json"),
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    format: "json-mcpServers",
    detect: (home) => existsSync(join(home, ".gemini")),
    configPath: (home) => join(home, ".gemini", "settings.json"),
  },
];

export function home(): string {
  return process.env.MNEMIA_HOME ?? homedir();
}

/** Every agent detected as installed on this machine. */
export function detectAgents(opts: { home?: string } = {}): AgentDef[] {
  const h = opts.home ?? home();
  return AGENTS.filter((a) => a.detect(h));
}
