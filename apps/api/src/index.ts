import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  assertPepperConfigured,
  getPool,
  openPickup,
  pollPickup,
  resolveApiKey,
  resolveOrCreateProjectByRepo,
  type KeyContext,
  type Ctx,
  type MemoryType,
} from "@mnemia/core";
import { HttpError, httpError } from "./http.js";
import { memoryEngine, captureEngine } from "./engines.js";

// ── Mnemia REST API — the MACHINE plane ──────────────────────────────────────────
//
// Agents (MCP/CLI) authenticate with a `mnem_live_*` key over Bearer. The only un-keyed routes
// are /health and the browser-approval handoff (/v1/oauth/start, /v1/oauth/pickup) — those are
// how a keyless install ACQUIRES a key (a human approves it in the web, see apps/web/app/connect).
//
// The data plane (recall/remember/capture/…) is STUBBED in this build: it authenticates the key
// and returns 501 not_implemented. That proves the credential end-to-end before the memory
// engine migrates in.

const PORT = Number(process.env.API_PORT ?? 8787);
const WEB_URL = process.env.MNEMIA_WEB_URL ?? "http://localhost:3000";
const API_URL = process.env.MNEMIA_API_URL ?? `http://localhost:${PORT}`;
const PICKUP_TTL_SEC = 600;
const POLL_INTERVAL_SEC = 2;

// An empty pepper silently defeats key hashing — refuse to boot without one.
assertPepperConfigured();

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: "mnemia-api" }));

// ── Auth handoff (un-keyed): the browser-approval pickup ─────────────────────────
// The agent generates `state`, we reserve a slot and hand back the web URL to open + poll cadence.
app.post("/v1/oauth/start", async (c) => {
  const { state } = await body(c);
  if (typeof state !== "string" || state.length < 16) throw httpError(400, "invalid_state");
  await openPickup(state);
  return c.json({
    authorizeUrl: `${WEB_URL}/connect?state=${encodeURIComponent(state)}`,
    interval: POLL_INTERVAL_SEC,
    expiresInSec: PICKUP_TTL_SEC,
  });
});

// The agent polls until a human approves; the minted token is returned exactly once.
app.post("/v1/oauth/pickup", async (c) => {
  const { state } = await body(c);
  if (typeof state !== "string" || !state) throw httpError(400, "invalid_state");
  const r = await pollPickup(state);
  return c.json({ ...r, apiUrl: API_URL });
});

// ── Identity / project plane (keyed) ─────────────────────────────────────────────
app.get("/v1/me", async (c) => {
  const k = await requireAuth(c);
  return c.json({ userId: k.userId ?? null, orgId: k.orgId, projectId: k.projectId });
});

app.get("/v1/projects", async (c) => {
  const k = await requireAuth(c);
  const { rows } = await getPool().query(
    `SELECT id, name FROM projects WHERE org_id = $1 ORDER BY created_at`,
    [k.orgId],
  );
  return c.json(rows);
});

app.post("/v1/projects", async (c) => {
  const k = await requireAuth(c);
  const { name } = await body(c);
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) throw httpError(400, "project_name_required");
  const { rows } = await getPool().query(
    `INSERT INTO projects (org_id, name) VALUES ($1, $2) RETURNING id, name`,
    [k.orgId, trimmed],
  );
  return c.json(rows[0]);
});

// ── Data plane (keyed) — the memory engine ────────────────────────────────────────
app.post("/v1/recall", async (c) => {
  const { ctx, body: b } = await keyedCtx(c);
  const hits = await captureEngine().recall(ctx, {
    query: str(b.query),
    limit: int(b.limit),
    includeStale: b.includeStale === true,
    includeRaw: b.includeRaw !== false,
  });
  return c.json(hits);
});

app.post("/v1/remember", async (c) => {
  const { ctx, body: b } = await keyedCtx(c);
  const res = await memoryEngine().add(ctx, {
    content: str(b.content),
    type: b.type as MemoryType | undefined,
    importance: typeof b.importance === "number" ? b.importance : undefined,
    sessionId: b.sessionId as string | undefined,
  });
  return c.json(res);
});

app.post("/v1/capture", async (c) => {
  const { ctx, body: b } = await keyedCtx(c);
  const out = await captureEngine().capture(ctx, {
    sessionId: b.sessionId as string | undefined,
    repo: b.repo as string | undefined,
    title: b.title as string | undefined,
    branch: b.branch as string | undefined,
    memories: Array.isArray(b.memories) ? (b.memories as { content: string; type?: MemoryType; importance?: number }[]) : [],
  });
  return c.json(out);
});

app.post("/v1/checkpoint", async (c) => {
  const { ctx, body: b } = await keyedCtx(c);
  const out = await captureEngine().checkpoint(ctx, {
    sessionId: b.sessionId as string | undefined,
    kind: b.kind as "full" | "partial" | undefined,
    payload: (b.payload as Record<string, unknown>) ?? {},
  });
  return c.json(out);
});

app.post("/v1/resume", async (c) => {
  const { ctx, body: b } = await keyedCtx(c);
  const out = await captureEngine().resume(ctx, {
    sessionId: b.sessionId as string | undefined,
    limit: int(b.limit),
    includeCheckpoint: b.includeCheckpoint !== false,
  });
  return c.json(out);
});

app.post("/v1/distill", async (c) => {
  await requireAuth(c);
  const b = await body(c);
  return c.json(captureEngine().distill(str(b.text)));
});

app.post("/v1/forget", async (c) => {
  const { ctx, body: b } = await keyedCtx(c);
  return c.json(await memoryEngine().forget(ctx, { id: str(b.id), hard: b.hard === true }));
});

// ── Raw transcript archive (keyed) ────────────────────────────────────────────────
app.post("/v1/archive", async (c) => {
  const { ctx, body: b } = await keyedCtx(c);
  const out = await captureEngine().archiveSession(ctx, {
    text: str(b.text),
    format: b.format as string | undefined,
    sessionId: b.sessionId as string | undefined,
    repo: b.repo as string | undefined,
    title: b.title as string | undefined,
  });
  return c.json(out);
});

app.post("/v1/transcript", async (c) => {
  const { ctx, body: b } = await keyedCtx(c);
  return c.json(await captureEngine().getTranscriptDoc(ctx, {
    sessionId: b.sessionId as string | undefined,
    transcriptId: b.transcriptId as string | undefined,
  }));
});

app.post("/v1/re_distill", async (c) => {
  const { ctx, body: b } = await keyedCtx(c);
  return c.json(await captureEngine().reDistill(ctx, {
    sessionId: b.sessionId as string | undefined,
    transcriptId: b.transcriptId as string | undefined,
    capture: b.capture === true,
  }));
});

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
  // eslint-disable-next-line no-console
  console.error("[mnemia-api] unhandled:", err);
  return c.json({ error: "internal_error" }, 500);
});

// ── helpers ──────────────────────────────────────────────────────────────────────
async function body(c: Context): Promise<Record<string, unknown>> {
  return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
}

async function requireAuth(c: Context): Promise<KeyContext> {
  const k = await resolveApiKey(c.req.header("authorization"));
  if (!k) throw httpError(401, "unauthorized");
  return k;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Resolve the effective project for a request. Precedence: an explicit body projectId (validated
 * to belong to the key's org — cross-tenant safe) → a repo (auto-provision per-repo) → the key's
 * bound project. org/user always come from the KEY, never the body.
 */
async function effectiveCtx(k: KeyContext, b: Record<string, unknown>): Promise<Ctx> {
  let projectId = k.projectId;
  const bodyProject = b.projectId as string | undefined;
  if (bodyProject) {
    const ok = await getPool().query(`SELECT 1 FROM projects WHERE id = $1 AND org_id = $2`, [bodyProject, k.orgId]);
    if (ok.rows[0]) projectId = bodyProject;
  } else if (typeof b.repo === "string" && b.repo.trim()) {
    projectId = await resolveOrCreateProjectByRepo(k.orgId, b.repo);
  }
  return { projectId, orgId: k.orgId, userId: k.userId, actor: "mcp" } as Ctx;
}

/** requireAuth + parse body + resolve the effective project context in one shot. */
async function keyedCtx(c: Context): Promise<{ ctx: Ctx; body: Record<string, unknown>; key: KeyContext }> {
  const key = await requireAuth(c);
  const b = await body(c);
  return { ctx: await effectiveCtx(key, b), body: b, key };
}

// Don't bind a port under test (vitest imports `app` and drives it directly).
if (process.env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port: PORT });
  // eslint-disable-next-line no-console
  console.log(`[mnemia-api] listening on :${PORT} (web=${WEB_URL})`);
}
