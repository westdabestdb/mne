import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentDef } from "./agents.js";
import { mnemiaMcpSpec, mergeMcpConfig, mergeServersConfig, type McpServerSpec } from "./mcp.js";

// ── Codex TOML ────────────────────────────────────────────
const tomlStr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const tomlArr = (a: string[]) => `[${a.map(tomlStr).join(", ")}]`;

export function codexBlock(spec: McpServerSpec): string {
  const lines = [
    "[mcp_servers.mnemia]",
    `command = ${tomlStr(spec.command)}`,
    `args = ${tomlArr(spec.args)}`,
    "",
    "[mcp_servers.mnemia.env]",
    ...Object.entries(spec.env).map(([k, v]) => `${k} = ${tomlStr(v)}`),
  ];
  return lines.join("\n") + "\n";
}

/** Drop any existing mnemia tables, then append a fresh block. Text-based (no full parse). */
export function mergeCodexToml(existing: string, spec: McpServerSpec): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of (existing ?? "").split("\n")) {
    const h = /^\s*\[(.+?)\]\s*$/.exec(line);
    if (h) {
      const name = h[1]!;
      skipping = name === "mcp_servers.mnemia" || name.startsWith("mcp_servers.mnemia.");
    }
    if (!skipping) kept.push(line);
  }
  let head = kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  if (head) head += "\n\n";
  return head + codexBlock(spec);
}

export function stripCodexToml(existing: string): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of (existing ?? "").split("\n")) {
    const h = /^\s*\[(.+?)\]\s*$/.exec(line);
    if (h) {
      const name = h[1]!;
      skipping = name === "mcp_servers.mnemia" || name.startsWith("mcp_servers.mnemia.");
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Write/merge the Mnemia MCP server into one agent's config in that agent's format. */
export function writeAgentConfig(agent: AgentDef, path: string, apiUrl: string): void {
  const spec = mnemiaMcpSpec(apiUrl, agent.id);
  mkdirSync(dirname(path), { recursive: true });

  if (agent.format === "toml-codex") {
    const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
    writeFileSync(path, mergeCodexToml(existing, spec));
    return;
  }

  let existing: Record<string, unknown> | null = null;
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      existing = null; // overwrite a malformed file with a valid one
    }
  }
  const merged = agent.format === "json-servers" ? mergeServersConfig(existing, spec) : mergeMcpConfig(existing, spec);
  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n");
}

/** Remove the Mnemia entry from one agent's config (best-effort; used by `uninstall`). */
export function removeAgentConfig(agent: AgentDef, path: string): void {
  if (!existsSync(path)) return;
  if (agent.format === "toml-codex") {
    writeFileSync(path, stripCodexToml(readFileSync(path, "utf8")));
    return;
  }
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return;
  }
  const mapKey = agent.format === "json-servers" ? "servers" : "mcpServers";
  const map = (j[mapKey] as Record<string, unknown>) ?? {};
  delete map.mnemia;
  j[mapKey] = map;
  writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
}
