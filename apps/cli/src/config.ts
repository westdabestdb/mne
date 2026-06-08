import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

// ── CLI credential store ─────────────────────────────────────────────────────────
// ~/.mnemia/config.json (0600). SAME file the MCP server reads (apps/mcp/src/config.ts), so
// `mnemia auth` here authorizes every agent's MCP at once — they all read this token.

export interface CliConfig {
  apiUrl?: string;
  token?: string;
  projectId?: string;
}

export function configDir(): string {
  return process.env.MNEMIA_CONFIG_DIR ?? join(homedir(), ".mnemia");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function readConfig(): CliConfig | null {
  try {
    const p = configPath();
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as CliConfig;
  } catch {
    return null;
  }
}

export function writeConfig(cfg: CliConfig): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

export function clearConfig(): void {
  try {
    rmSync(configPath());
  } catch {
    /* nothing to clear */
  }
}
