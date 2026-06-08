import { spawn } from "node:child_process";

/**
 * Best-effort: open a URL in the user's default browser. Non-fatal on failure (the URL is always
 * returned to the agent as text too, so a headless client can copy it).
 */
export function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* non-fatal — the URL is surfaced to the agent regardless */
  }
}
