import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

// ── MCP-side credential store ───────────────────────────────────────────────────
// Stored at ~/.mnemia/config.json (0600) so the in-agent `authenticate` flow and a future
// `mnemia connect` CLI share one credential file. Dependency-free (node builtins only) so it
// bundles cleanly.

export interface McpConfig {
  apiUrl?: string;
  token?: string;
  projectId?: string;
}

/** Config home — overridable via MNEMIA_CONFIG_DIR (used by tests). */
export function configDir(): string {
  return process.env.MNEMIA_CONFIG_DIR ?? join(homedir(), ".mnemia");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function readConfig(): McpConfig | null {
  try {
    const p = configPath();
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as McpConfig;
  } catch {
    return null;
  }
}

export function writeConfig(cfg: McpConfig): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  // 0600 — the file holds a live API token
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}
