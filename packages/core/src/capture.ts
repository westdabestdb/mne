import { getPool } from "./db.js";
import { MemoryEngine } from "./memory.js";
import { HeuristicDistiller } from "./distiller.js";
import { archiveTranscript, getTranscript, searchTranscriptChunks, flattenForEmbedding } from "./transcripts.js";
import type {
  Ctx, Session, Checkpoint, CheckpointKind, CheckpointPayload, CaptureItem, AddResult,
  DistilledMemory, ResumeResult, RecallHit, RawHit, HybridHit, ArchiveResult, TranscriptDoc, Embedder,
} from "./types.js";

const RAW_WEIGHT = 0.6; // raw spans are down-weighted so an equal-relevance memory ranks higher

/** Session lifecycle + capture + checkpoint + resume + raw archive + hybrid recall. */
export class CaptureEngine {
  private readonly distiller = new HeuristicDistiller();

  constructor(
    private readonly memory: MemoryEngine,
    private readonly embedder: Embedder,
  ) {}

  async startSession(ctx: Ctx, a: { repo?: string; title?: string; branch?: string; source?: string } = {}): Promise<Session> {
    const row = (
      await getPool().query(
        `INSERT INTO sessions (project_id, title, repo, git_branch, source)
              VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [ctx.projectId, a.title ?? null, a.repo ?? null, a.branch ?? null, a.source ?? ctx.actor ?? null],
      )
    ).rows[0];
    return rowToSession(row);
  }

  private async ensureSession(ctx: Ctx, a: { sessionId?: string; repo?: string; title?: string; branch?: string }): Promise<Session> {
    if (a.sessionId) {
      const r = await getPool().query(`SELECT * FROM sessions WHERE id = $1 AND project_id = $2`, [a.sessionId, ctx.projectId]);
      if (r.rows[0]) return rowToSession(r.rows[0]);
    }
    return this.startSession(ctx, a);
  }

  /** Store distilled, typed memories under a session. */
  async capture(
    ctx: Ctx,
    a: { sessionId?: string; repo?: string; title?: string; branch?: string; memories: CaptureItem[] },
  ): Promise<{ session: Session; results: AddResult[] }> {
    const session = await this.ensureSession(ctx, a);
    const sctx = { ...ctx };
    const results: AddResult[] = [];
    for (const item of a.memories ?? []) {
      results.push(await this.memory.add(sctx, { content: item.content, type: item.type, importance: item.importance, sessionId: session.id, source: ctx.actor }));
    }
    return { session, results };
  }

  async checkpoint(
    ctx: Ctx,
    a: { sessionId?: string; repo?: string; kind?: CheckpointKind; payload: CheckpointPayload },
  ): Promise<Checkpoint> {
    const session = await this.ensureSession(ctx, a);
    const row = (
      await getPool().query(
        `INSERT INTO checkpoints (session_id, project_id, kind, payload)
              VALUES ($1, $2, $3, $4) RETURNING *`,
        [session.id, ctx.projectId, a.kind ?? "full", JSON.stringify(a.payload ?? {})],
      )
    ).rows[0];
    return rowToCheckpoint(row);
  }

  /** Distill raw text into typed memories WITHOUT storing (review, then capture). */
  distill(text: string): { memories: DistilledMemory[] } {
    return { memories: this.distiller.distill(text) };
  }

  /** Store a session's full transcript verbatim (sealed at rest) + chunk-embed it. */
  async archiveSession(
    ctx: Ctx,
    a: { text: string; sessionId?: string; repo?: string; title?: string; format?: string },
  ): Promise<{ session: Session } & ArchiveResult> {
    const session = await this.ensureSession(ctx, a);
    const res = await archiveTranscript(ctx, this.embedder, { text: a.text, format: a.format, sessionId: session.id });
    return { session, ...res };
  }

  getTranscriptDoc(ctx: Ctx, a: { sessionId?: string; transcriptId?: string }): Promise<TranscriptDoc> {
    return getTranscript(ctx, a);
  }

  /** Re-run distillation over the STORED raw transcript (raw is the source-of-truth). */
  async reDistill(
    ctx: Ctx,
    a: { sessionId?: string; transcriptId?: string; capture?: boolean },
  ): Promise<{ memories: DistilledMemory[]; captured?: number; sessionId?: string }> {
    const doc = await getTranscript(ctx, a);
    // Distill the readable, flattened transcript — not the raw JSONL envelope.
    const memories = this.distiller.distill(flattenForEmbedding(doc.content, doc.format));
    let captured: number | undefined;
    if (a.capture) {
      for (const m of memories) await this.memory.add(ctx, { content: m.content, type: m.type, importance: m.importance, sessionId: doc.sessionId });
      captured = memories.length;
    }
    return { memories, captured, sessionId: doc.sessionId };
  }

  /** Hybrid recall: curated memories + raw transcript spans, raw down-weighted. */
  async recall(
    ctx: Ctx,
    a: { query: string; limit?: number; includeStale?: boolean; includeRaw?: boolean },
  ): Promise<HybridHit[]> {
    const limit = a.limit ?? 8;
    const memHits: RecallHit[] = await this.memory.search(ctx, { query: a.query, limit, includeStale: a.includeStale });
    if (a.includeRaw === false) return memHits.slice(0, limit);

    const chunks = await searchTranscriptChunks(ctx, this.embedder, { query: a.query, limit: Math.ceil(limit / 2) });
    const rawHits: RawHit[] = chunks.map((c) => ({
      __source: "raw",
      __score: Math.round(c.sim * RAW_WEIGHT * 1000) / 1000,
      __why: "raw transcript span",
      content: c.content,
      transcriptId: c.transcriptId,
      sessionId: c.sessionId,
      seq: c.seq,
    }));

    return [...memHits, ...rawHits].sort((x, y) => y.__score - x.__score).slice(0, limit);
  }

  /** Rehydrate a cold session: ranked memories + latest checkpoint + a synthesized brief. */
  async resume(
    ctx: Ctx,
    a: { sessionId?: string; repo?: string; limit?: number; includeCheckpoint?: boolean } = {},
  ): Promise<ResumeResult> {
    const session = await this.latestSession(ctx, a.sessionId);
    const checkpoint = a.includeCheckpoint === false || !session ? null : await this.latestCheckpoint(ctx, session.id);

    // Seed recall from the checkpoint's plan/threads (or the session title) so resume surfaces
    // the most relevant context, not just the newest.
    const seed =
      [checkpoint?.payload?.plan, (checkpoint?.payload?.openThreads ?? []).join(" "), session?.title]
        .filter(Boolean)
        .join(" ")
        .trim() || (session?.title ?? "recent work");
    const memories = await this.recall(ctx, { query: seed, limit: a.limit ?? 10, includeRaw: false });

    return { session: session ?? undefined, checkpoint, memories, brief: synthesizeBrief(session, memories, checkpoint) };
  }

  private async latestSession(ctx: Ctx, sessionId?: string): Promise<Session | null> {
    const r = sessionId
      ? await getPool().query(`SELECT * FROM sessions WHERE id = $1 AND project_id = $2`, [sessionId, ctx.projectId])
      : await getPool().query(`SELECT * FROM sessions WHERE project_id = $1 ORDER BY started_at DESC LIMIT 1`, [ctx.projectId]);
    return r.rows[0] ? rowToSession(r.rows[0]) : null;
  }

  private async latestCheckpoint(ctx: Ctx, sessionId: string): Promise<Checkpoint | null> {
    const r = await getPool().query(
      `SELECT * FROM checkpoints WHERE session_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [sessionId, ctx.projectId],
    );
    return r.rows[0] ? rowToCheckpoint(r.rows[0]) : null;
  }
}

/** Heuristic brief — a short, agent-neutral "where you left off" without an LLM. */
export function synthesizeBrief(session: Session | null, memories: HybridHit[], checkpoint: Checkpoint | null): string {
  const lines: string[] = [];
  lines.push(session?.title ? `Resuming "${session.title}".` : "Resuming your last session.");
  if (checkpoint) {
    const p = checkpoint.payload;
    if (p.plan) lines.push(`Plan: ${p.plan}`);
    if (p.branch) lines.push(`Branch: ${p.branch}`);
    if (p.files?.length) lines.push(`Touched ${p.files.length} file(s): ${p.files.slice(0, 5).join(", ")}${p.files.length > 5 ? "…" : ""}`);
    if (p.todos?.length) lines.push(`TODO: ${p.todos.slice(0, 5).join("; ")}`);
    if (p.openThreads?.length) lines.push(`Open threads: ${p.openThreads.slice(0, 5).join("; ")}`);
  }
  const top = memories.slice(0, 5);
  if (top.length) {
    lines.push("Top context:");
    for (const m of top) {
      const tag = m.__source === "memory" ? m.type : "raw";
      lines.push(`  • [${tag}] ${trim(m.content, 120)}`);
    }
  }
  return lines.join("\n");
}

function trim(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function rowToSession(r: Record<string, unknown>): Session {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    title: (r.title as string | null) ?? undefined,
    repo: (r.repo as string | null) ?? undefined,
    gitBranch: (r.git_branch as string | null) ?? undefined,
    source: (r.source as string | null) ?? undefined,
    startedAt: new Date(r.started_at as string).toISOString(),
    endedAt: r.ended_at ? new Date(r.ended_at as string).toISOString() : undefined,
    summary: (r.summary as string | null) ?? undefined,
  };
}

function rowToCheckpoint(r: Record<string, unknown>): Checkpoint {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    projectId: r.project_id as string,
    kind: r.kind as CheckpointKind,
    payload: (r.payload as CheckpointPayload) ?? {},
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}
