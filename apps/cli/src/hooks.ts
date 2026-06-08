import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { home } from "./agents.js";

// ── Claude Code session-lifecycle hooks ────────────────────────────────────────────
// Auto-capture without the agent calling tools: on Stop we archive + distill the transcript,
// on SessionStart we resume (its stdout is injected as context). Installed into the global
// ~/.claude/settings.json. Idempotent — re-running replaces our entries, never duplicates.

const EVENTS: [event: string, sub: string][] = [
  ["SessionStart", "session-start"],
  ["Stop", "stop"],
];

/** The command a hook runs — the installed CLI launcher (overridable for dev). */
export function hookCommand(): string {
  return process.env.MNEMIA_HOOK_COMMAND ?? join(home(), ".mnemia", "bin", "mnemia");
}

export function settingsPath(): string {
  return join(home(), ".claude", "settings.json");
}

type HookEntry = { type: string; command: string };
type HookGroup = { matcher?: string; hooks?: HookEntry[] };

function isMnemiaGroup(g: HookGroup): boolean {
  return !!g?.hooks?.some((h) => typeof h?.command === "string" && /mnemia/.test(h.command) && /\bhook\b/.test(h.command));
}

/** Pure merge: drop any prior Mnemia groups, add fresh ones for each lifecycle event. */
export function mergeHooks(existing: Record<string, unknown> | null, cmd: string): Record<string, unknown> {
  const j = existing && typeof existing === "object" ? { ...existing } : {};
  const hooks = { ...((j.hooks as Record<string, HookGroup[]>) ?? {}) };
  for (const [event, sub] of EVENTS) {
    const kept = (Array.isArray(hooks[event]) ? hooks[event] : []).filter((g) => !isMnemiaGroup(g));
    kept.push({ hooks: [{ type: "command", command: `${cmd} hook ${sub}` }] });
    hooks[event] = kept;
  }
  j.hooks = hooks;
  return j;
}

export function installHooks(): void {
  const p = settingsPath();
  let existing: Record<string, unknown> | null = null;
  if (existsSync(p)) {
    try {
      existing = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    } catch {
      existing = null;
    }
  }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(mergeHooks(existing, hookCommand()), null, 2) + "\n");
}

export function removeHooks(): void {
  const p = settingsPath();
  if (!existsSync(p)) return;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return;
  }
  const hooks = j.hooks as Record<string, HookGroup[]> | undefined;
  if (!hooks) return;
  for (const [event] of EVENTS) {
    if (Array.isArray(hooks[event])) {
      hooks[event] = hooks[event].filter((g) => !isMnemiaGroup(g));
      if (hooks[event].length === 0) delete hooks[event];
    }
  }
  writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}
