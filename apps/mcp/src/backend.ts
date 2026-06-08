import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { SessionPin } from "./pin.js";
import { readConfig, writeConfig } from "./config.js";

// ── Proxy backend ────────────────────────────────────────────────────────────────
// Talks to the Mnemia REST API (apps/api) over /v1/*. The API key may be absent at boot
// (keyless install) and acquired at runtime via authStart/authComplete (browser approval →
// pickup → minted key). In THIS build only the auth + project plane is wired; memory tools
// are stubbed in server.ts.

export interface ProjectLite {
  id: string;
  name: string;
}

export type AuthStart = { authorizeUrl: string; state: string };
export interface AuthComplete {
  status: "authorized" | "pending" | "expired" | "unknown";
  projectId?: string;
}

export interface Identity {
  actor: string;
  defaultProject?: string;
}

export function identityFromEnv(): Identity {
  return {
    actor: process.env.MNEMIA_ACTOR ?? "mcp",
    defaultProject: process.env.MNEMIA_PROJECT_ID || undefined,
  };
}

export class ProxyBackend {
  private readonly session = new SessionPin();
  private readonly repo: string | undefined;
  private apiKey: string | undefined;
  private pendingAuth: { state: string; interval: number } | undefined;
  // Remembered across calls so checkpoint/capture stay on the session capture/resume/archive opened.
  private lastSessionId: string | undefined;

  constructor(
    private readonly apiUrl: string,
    apiKey: string | undefined,
    private readonly id: Identity,
  ) {
    this.apiKey = apiKey;
    this.repo = detectRepo();
  }

  isAuthenticated(): boolean {
    return !!this.apiKey;
  }
  activeProject(): string | undefined {
    return this.session.getActiveProject() ?? this.id.defaultProject;
  }

  /** Generic request. `auth: false` for the un-keyed oauth pickup endpoints. */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    bodyJson?: unknown,
    opts: { auth?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (bodyJson !== undefined) headers["content-type"] = "application/json";
    if (opts.auth !== false) {
      if (!this.apiKey) {
        throw new Error("not_authenticated — run the `mne_authenticate` tool, then `mne_complete_authentication`");
      }
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    const res = await fetch(`${this.apiUrl}/v1/${path}`, {
      method,
      headers,
      body: bodyJson !== undefined ? JSON.stringify(bodyJson) : undefined,
    });
    if (!res.ok) throw new Error(`api ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  // ── auth plane ───────────────────────────────────────────────────────────────
  async authStart(): Promise<AuthStart> {
    const state = randomBytes(24).toString("hex");
    const r = await this.request<{ authorizeUrl: string; interval: number; expiresInSec: number }>(
      "POST",
      "oauth/start",
      { state },
      { auth: false },
    );
    this.pendingAuth = { state, interval: r.interval };
    return { authorizeUrl: r.authorizeUrl, state };
  }

  async authComplete(state?: string): Promise<AuthComplete> {
    const s = state ?? this.pendingAuth?.state;
    if (!s) throw new Error("no pending authentication — run the `mne_authenticate` tool first");
    const intervalMs = Math.max(1, this.pendingAuth?.interval ?? 2) * 1000;
    const capMs = Number(process.env.MNEMIA_AUTH_TIMEOUT_MS ?? 180_000);
    const deadline = Date.now() + capMs;
    while (Date.now() < deadline) {
      const r = await this.request<{
        status: AuthComplete["status"];
        token?: string;
        projectId?: string;
        apiUrl?: string;
      }>("POST", "oauth/pickup", { state: s }, { auth: false });
      if (r.status === "authorized" && r.token) {
        this.apiKey = r.token;
        this.pendingAuth = undefined;
        const cur = readConfig() ?? {};
        writeConfig({ ...cur, apiUrl: r.apiUrl ?? this.apiUrl, token: r.token, projectId: r.projectId ?? cur.projectId });
        return { status: "authorized", projectId: r.projectId };
      }
      if (r.status === "expired" || r.status === "unknown") {
        this.pendingAuth = undefined;
        return { status: r.status };
      }
      await sleep(intervalMs);
    }
    return { status: "pending" };
  }

  // ── project plane ──────────────────────────────────────────────────────────────
  whoami(): Promise<{ userId: string | null; orgId: string; projectId: string }> {
    return this.request("GET", "me");
  }

  listProjects(): Promise<ProjectLite[]> {
    return this.request<ProjectLite[]>("GET", "projects");
  }

  async createProject(name: string): Promise<ProjectLite> {
    const p = await this.request<ProjectLite>("POST", "projects", { name });
    this.session.setActiveProject(p.id);
    return p;
  }

  async useProject(idOrName: string): Promise<ProjectLite> {
    const q = idOrName.trim();
    if (!q) throw new Error("project_required — pass a project id or name");
    const projects = await this.listProjects();
    const match =
      projects.find((p) => p.id === q) ?? projects.find((p) => p.name.toLowerCase() === q.toLowerCase());
    if (!match) throw new Error(`project_not_found — no project matching "${idOrName}" in your org`);
    this.session.setActiveProject(match.id);
    return match;
  }

  // ── data plane ───────────────────────────────────────────────────────────────
  // Every call carries the active project + detected repo; the API resolves the effective
  // project (explicit projectId > repo > key-bound) and the org/user from the key.
  private data<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, {
      projectId: this.session.getActiveProject() ?? this.id.defaultProject,
      repo: this.repo,
      ...body,
    });
  }
  private withSession<T extends { session?: { id?: string } }>(p: Promise<T>): Promise<T> {
    return p.then((out) => {
      if (out.session?.id) this.lastSessionId = out.session.id;
      return out;
    });
  }

  recall(a: Record<string, unknown>): Promise<unknown> {
    return this.data("recall", a);
  }
  remember(a: Record<string, unknown>): Promise<unknown> {
    return this.data("remember", a);
  }
  capture(a: Record<string, unknown>): Promise<unknown> {
    return this.withSession(this.data("capture", { ...a, sessionId: a.sessionId ?? this.lastSessionId }));
  }
  checkpoint(a: Record<string, unknown>): Promise<unknown> {
    return this.data("checkpoint", { ...a, sessionId: a.sessionId ?? this.lastSessionId });
  }
  resume(a: Record<string, unknown>): Promise<unknown> {
    return this.withSession(this.data("resume", a));
  }
  distill(a: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", "distill", a);
  }
  forget(a: Record<string, unknown>): Promise<unknown> {
    return this.data("forget", a);
  }
  archiveSession(a: Record<string, unknown>): Promise<unknown> {
    return this.withSession(this.data("archive", { ...a, sessionId: a.sessionId ?? this.lastSessionId }));
  }
  getTranscript(a: Record<string, unknown>): Promise<unknown> {
    return this.data("transcript", { ...a, sessionId: a.sessionId ?? this.lastSessionId });
  }
  reDistill(a: Record<string, unknown>): Promise<unknown> {
    return this.data("re_distill", { ...a, sessionId: a.sessionId ?? this.lastSessionId });
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Best-effort git remote of the cwd the MCP server was spawned in. */
function detectRepo(): string | undefined {
  if (process.env.MNEMIA_REPO) return process.env.MNEMIA_REPO;
  try {
    const out = execFileSync("git", ["remote", "get-url", "origin"], { stdio: ["ignore", "pipe", "ignore"] });
    return out.toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Build the proxy backend from env + stored config. */
export function makeBackend(id: Identity = identityFromEnv()): ProxyBackend {
  const cfg = readConfig();
  const apiUrl =
    process.env.MNEMIA_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? cfg?.apiUrl ?? "http://localhost:8787";
  const key = process.env.MNEMIA_API_KEY || cfg?.token || undefined;
  return new ProxyBackend(apiUrl, key, id);
}
