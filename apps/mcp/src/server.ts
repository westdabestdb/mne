import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ProxyBackend } from "./backend.js";
import { openBrowser } from "./browser.js";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({
  content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
});

const MEMORY_TYPE = z.enum(["decision", "convention", "fact", "gotcha", "reference", "open_thread"]);

/**
 * Build the Mnemia MCP server. Every tool is namespaced `mne_*`. Auth + projects bind this agent
 * to a real web account; the memory plane (recall/capture/checkpoint/resume/archive/…) is live.
 */
export function buildServer(backend: ProxyBackend): McpServer {
  const server = new McpServer({ name: "mnemia", version: "0.1.0" });

  // ── auth plane ───────────────────────────────────────────────────────────────────
  server.registerTool(
    "mne_authenticate",
    {
      description:
        "Connect this agent to Mnemia by signing in through your browser. Opens the Mnemia dashboard; " +
        "after you approve the device, call `mne_complete_authentication` to finish. No-op if already " +
        "authenticated. Use this when a tool reports `not_authenticated`.",
      inputSchema: {},
    },
    async () => {
      try {
        if (backend.isAuthenticated()) {
          return ok({ status: "already_authenticated", message: "Already signed in. Use mne_list_projects / mne_use_project." });
        }
        const r = await backend.authStart();
        openBrowser(r.authorizeUrl);
        return ok({
          status: "awaiting_approval",
          authorizeUrl: r.authorizeUrl,
          next: "A browser window should have opened. Sign in and approve, then call `mne_complete_authentication`. If no browser opened, open the authorizeUrl manually.",
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "mne_complete_authentication",
    {
      description:
        "Finish the browser sign-in started by `mne_authenticate`: polls until you approve, then stores the " +
        "credential for this and future sessions. If it returns 'pending', approve in the browser and call again.",
      inputSchema: { state: z.string().optional().describe("auth state from mne_authenticate (optional — uses the pending one)") },
    },
    async (a) => {
      try {
        const r = await backend.authComplete(a.state);
        if (r.status === "authorized") {
          return ok({ status: "authorized", projectId: r.projectId, message: "Authenticated. Use mne_list_projects / mne_create_project to choose a working project." });
        }
        if (r.status === "pending") {
          return ok({ status: "pending", message: "Not approved yet — finish approving in the browser, then call `mne_complete_authentication` again." });
        }
        return ok({ status: r.status, message: "Authentication didn't complete — run `mne_authenticate` again to restart." });
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ── project plane ──────────────────────────────────────────────────────────────────
  server.registerTool(
    "mne_list_projects",
    { description: "List the projects in your Mnemia org and which one is active for this conversation.", inputSchema: {} },
    async () => {
      try {
        return ok({ projects: await backend.listProjects(), activeProjectId: backend.activeProject() });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "mne_create_project",
    {
      description: "Create a new Mnemia project in your org and pin it to this conversation.",
      inputSchema: { name: z.string().min(1).max(80).describe("project name") },
    },
    async (a) => {
      try {
        const project = await backend.createProject(a.name);
        return ok({ project, pinned: true, message: `Created and switched to project "${project.name}".` });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "mne_use_project",
    {
      description: "Select an existing project (by id or name) and pin it to this conversation.",
      inputSchema: { project: z.string().min(1).describe("project id or name") },
    },
    async (a) => {
      try {
        const project = await backend.useProject(a.project);
        return ok({ project, pinned: true, message: `Switched to project "${project.name}".` });
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ── memory plane ─────────────────────────────────────────────────────────────────
  const routing = {
    projectId: z.string().uuid().optional().describe("explicit project id; else the active project or repo mapping"),
    repo: z.string().optional().describe("git remote URL — resolves/auto-creates a project if projectId omitted"),
  };
  const run = async (fn: () => Promise<unknown>) => {
    try {
      return ok(await fn());
    } catch (e) {
      return fail(e);
    }
  };

  server.registerTool(
    "mne_recall",
    {
      description:
        "Recall the most relevant memories for a query, ranked + explained (semantic·recency·importance·" +
        "confidence). Returns curated memories AND raw transcript spans (hybrid), each tagged __source. " +
        "Call this at the start of work to rehydrate context.",
      inputSchema: { query: z.string(), limit: z.number().optional(), includeStale: z.boolean().optional(), includeRaw: z.boolean().optional(), ...routing },
    },
    async (a) => run(() => backend.recall(a)),
  );
  server.registerTool(
    "mne_remember",
    {
      description: "Pin a single typed memory (decision/convention/fact/gotcha/reference/open_thread). Deduped + contradiction-checked against existing memories.",
      inputSchema: { content: z.string(), type: MEMORY_TYPE.optional(), importance: z.number().min(0).max(1).optional(), ...routing },
    },
    async (a) => run(() => backend.remember(a)),
  );
  server.registerTool(
    "mne_capture",
    {
      description: "Store a batch of distilled, typed memories under a session (the session is opened/pinned automatically).",
      inputSchema: {
        memories: z.array(z.object({ content: z.string(), type: MEMORY_TYPE.optional(), importance: z.number().min(0).max(1).optional() })),
        sessionId: z.string().uuid().optional(), title: z.string().optional(), branch: z.string().optional(), ...routing,
      },
    },
    async (a) => run(() => backend.capture(a)),
  );
  server.registerTool(
    "mne_checkpoint",
    {
      description: "Save an agent-neutral session snapshot: files touched, branch, plan, todos, open threads. Resume rehydrates the latest one.",
      inputSchema: {
        payload: z.object({
          files: z.array(z.string()).optional(), branch: z.string().optional(), plan: z.string().optional(),
          todos: z.array(z.string()).optional(), openThreads: z.array(z.string()).optional(),
        }).passthrough(),
        kind: z.enum(["full", "partial"]).optional(), sessionId: z.string().uuid().optional(), ...routing,
      },
    },
    async (a) => run(() => backend.checkpoint(a)),
  );
  server.registerTool(
    "mne_resume",
    {
      description: "Rehydrate a cold session: ranked memories + the latest checkpoint + a synthesized 'where you left off' brief. Use when returning to a project.",
      inputSchema: { sessionId: z.string().uuid().optional(), limit: z.number().optional(), ...routing },
    },
    async (a) => run(() => backend.resume(a)),
  );
  server.registerTool(
    "mne_distill",
    { description: "Turn raw session text into typed memory candidates WITHOUT storing them (review, then capture).", inputSchema: { text: z.string() } },
    async (a) => run(() => backend.distill(a)),
  );
  server.registerTool(
    "mne_forget",
    { description: "Soft-archive a memory (default) or hard-delete it.", inputSchema: { id: z.string(), hard: z.boolean().optional(), ...routing } },
    async (a) => run(() => backend.forget(a)),
  );

  // ── raw transcript archive ─────────────────────────────────────────────────────────
  server.registerTool(
    "mne_archive_session",
    {
      description:
        "Store a session's FULL transcript verbatim (sealed at rest) + chunk-embed it, so hybrid recall can " +
        "surface raw spans and you can re-distill later. This is the lossless layer behind 'resume a month later'.",
      inputSchema: { text: z.string(), format: z.enum(["text", "claude_code"]).optional(), sessionId: z.string().uuid().optional(), title: z.string().optional(), ...routing },
    },
    async (a) => run(() => backend.archiveSession(a)),
  );
  server.registerTool(
    "mne_get_transcript",
    { description: "Fetch the stored verbatim transcript for a session.", inputSchema: { sessionId: z.string().uuid().optional(), transcriptId: z.string().uuid().optional(), ...routing } },
    async (a) => run(() => backend.getTranscript(a)),
  );
  server.registerTool(
    "mne_re_distill",
    { description: "Re-run distillation over a stored raw transcript (raw is the source-of-truth). Optionally capture the results.", inputSchema: { sessionId: z.string().uuid().optional(), transcriptId: z.string().uuid().optional(), capture: z.boolean().optional(), ...routing } },
    async (a) => run(() => backend.reDistill(a)),
  );

  return server;
}
