import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readConfig } from "./config.js";
import { resolveApiUrl } from "./install.js";
import { archiveRaw, reDistill, resume } from "./api.js";

// ── Auto-capture hook runtime ───────────────────────────────────────────────────────
// Invoked by Claude Code's lifecycle hooks (see hooks.ts). Claude Code pipes a JSON payload on
// stdin: { transcript_path, cwd, session_id, hook_event_name, ... }. We NEVER block the agent —
// any failure (not authed, API down, no transcript) exits 0 silently.
//
//   Stop          → ship the full transcript to /v1/archive (lossless) + re-distill → capture
//   SessionStart  → /v1/resume; print the brief to stdout (Claude Code injects it as context)

const MAX_BYTES = Number(process.env.MNEMIA_MAX_TRANSCRIPT_BYTES ?? 10 * 1024 * 1024);

export async function cmdHook(event: string | undefined): Promise<number> {
  const cfg = readConfig();
  const apiUrl = resolveApiUrl();
  if (!cfg?.token) return 0; // not authenticated yet — silent no-op

  const input = parseStdin(await readStdin());
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const repo = gitRemote(cwd);

  try {
    if (event === "stop" || event === "Stop") {
      const tpath = input.transcript_path as string | undefined;
      if (!tpath || !existsSync(tpath)) return 0;
      let text = readFileSync(tpath, "utf8");
      if (!text.trim()) return 0;
      if (Buffer.byteLength(text, "utf8") > MAX_BYTES) text = text.slice(-MAX_BYTES); // keep the tail
      const arch = await archiveRaw(apiUrl, cfg.token, { text, format: "claude_code", repo });
      // Pass repo so re_distill resolves the SAME per-repo project the archive landed in.
      if (arch?.transcriptId) await reDistill(apiUrl, cfg.token, { transcriptId: arch.transcriptId, capture: true, repo });
    } else if (event === "session-start" || event === "SessionStart") {
      const r = await resume(apiUrl, cfg.token, { repo });
      if (r?.brief) process.stdout.write(`# Mnemia — resuming where you left off\n\n${r.brief}\n`);
    }
  } catch (e) {
    // Surface to the hook log but never fail — a non-zero exit would disrupt the agent.
    process.stderr.write(`mnemia hook ${event}: ${e instanceof Error ? e.message : String(e)}\n`);
  }
  return 0;
}

function parseStdin(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function gitRemote(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || undefined;
  } catch {
    return undefined;
  }
}
