import { randomBytes } from "node:crypto";
import { openBrowser } from "./browser.js";
import { startOauth, pollOauth, getMe } from "./api.js";
import { readConfig, writeConfig } from "./config.js";
import { resolveApiUrl } from "./install.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * `mnemia auth` — browser approval flow. We open the web /connect page; the (logged-in) human
 * approves; the API hands back a key minted against their account; we store it in
 * ~/.mnemia/config.json. Every agent's MCP reads that same file, so one `mnemia auth` authorizes
 * them all. No manual config — the user only clicks "Authorize" in their browser.
 */
export async function cmdAuth(): Promise<number> {
  const apiUrl = resolveApiUrl();

  if (readConfig()?.token) {
    console.log("Already authenticated. Re-run with `mnemia auth --force` to replace the credential.");
    if (!process.argv.includes("--force")) return 0;
  }

  const state = randomBytes(24).toString("hex");
  let start;
  try {
    start = await startOauth(apiUrl, state);
  } catch (e) {
    console.error(`Could not reach the Mnemia API at ${apiUrl}.`);
    console.error(`  ${e instanceof Error ? e.message : String(e)}`);
    console.error("Is the API running? Set MNEMIA_API_URL if it's elsewhere.");
    return 1;
  }

  console.log("\nOpening your browser to approve this device…");
  console.log(`  ${start.authorizeUrl}`);
  console.log("(If it didn't open, paste that URL into your browser.)\n");
  openBrowser(start.authorizeUrl);

  const intervalMs = Math.max(1, start.interval) * 1000;
  const deadline = Date.now() + start.expiresInSec * 1000;
  process.stdout.write("Waiting for approval");
  while (Date.now() < deadline) {
    const r = await pollOauth(apiUrl, state);
    if (r.status === "authorized" && r.token) {
      writeConfig({ ...(readConfig() ?? {}), apiUrl: r.apiUrl ?? apiUrl, token: r.token, projectId: r.projectId });
      console.log("\n\n✓ Authenticated. Your agents are connected to Mnemia.");
      return 0;
    }
    if (r.status === "expired" || r.status === "unknown") {
      console.error(`\n\nAuthorization ${r.status}. Run \`mnemia auth\` again to restart.`);
      return 1;
    }
    process.stdout.write(".");
    await sleep(intervalMs);
  }
  console.error("\n\nTimed out waiting for approval. Run `mnemia auth` again.");
  return 1;
}

/** `mnemia status` — show where we point and whether we're authenticated. */
export async function cmdStatus(): Promise<number> {
  const cfg = readConfig();
  const apiUrl = resolveApiUrl();
  console.log(`API:   ${apiUrl}`);
  if (!cfg?.token) {
    console.log("Auth:  not authenticated — run `mnemia auth`");
    return 0;
  }
  try {
    const me = await getMe(apiUrl, cfg.token);
    console.log(`Auth:  ✓ authenticated (org ${me.orgId})`);
    console.log(`Project: ${me.projectId}`);
  } catch {
    console.log("Auth:  token present but the API rejected it — run `mnemia auth` again.");
  }
  return 0;
}
