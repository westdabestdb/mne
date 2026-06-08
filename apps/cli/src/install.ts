import { detectAgents, home, AGENTS, type AgentDef } from "./agents.js";
import { writeAgentConfig, removeAgentConfig } from "./writers.js";
import { readConfig, writeConfig, clearConfig } from "./config.js";

const DEFAULT_API = "http://localhost:8787";

export function resolveApiUrl(): string {
  return process.env.MNEMIA_API_URL ?? readConfig()?.apiUrl ?? DEFAULT_API;
}

/**
 * Wire the Mnemia MCP server into every detected agent. NO credential is written here — the agent
 * config carries only MNEMIA_API_URL; the key is acquired later by `mnemia auth` (stored in
 * ~/.mnemia/config.json, which the MCP reads at runtime). Idempotent.
 */
export function cmdInstall(): number {
  const apiUrl = resolveApiUrl();
  const h = home();
  const agents = detectAgents({ home: h });

  // Remember the API origin so `mnemia auth` targets the same backend.
  writeConfig({ ...(readConfig() ?? {}), apiUrl });

  if (agents.length === 0) {
    console.log("No supported agents detected (Claude Code, Cursor, Windsurf, Codex, VS Code, Gemini).");
    console.log("Install one, then re-run: mnemia install");
    return 0;
  }

  for (const agent of agents) {
    const path = agent.configPath(h);
    writeAgentConfig(agent, path, apiUrl);
    console.log(`  ✓ ${agent.label.padEnd(12)} → ${path}`);
  }
  console.log(`\nWired ${agents.length} agent${agents.length > 1 ? "s" : ""} to Mnemia (${apiUrl}).`);
  console.log("Next: run `mnemia auth` to sign in.");
  return 0;
}

/** Remove the Mnemia MCP entry from every agent (best-effort) and clear the stored credential. */
export function cmdUninstall(): number {
  const h = home();
  for (const agent of AGENTS as AgentDef[]) {
    try {
      removeAgentConfig(agent, agent.configPath(h));
    } catch {
      /* best-effort */
    }
  }
  clearConfig();
  console.log("Removed Mnemia from all agent configs and cleared the stored credential.");
  return 0;
}
