import { getPool } from "./db.js";
import { vecLiteral, isZeroVec } from "./vec.js";
import { recallScore, explainRecall, normalizeSemantic } from "./recall.js";
import { makeContradictionDetector, type ContradictionDetector } from "./contradiction.js";
import type { Ctx, Memory, MemoryType, AddInput, AddResult, RecallHit, Freshness } from "./types.js";

const COLS =
  "id, project_id, session_id, type, content, importance, confidence, status, superseded_by, " +
  "access_count, ttl_days, last_verified_at, source, created_at, updated_at";

const DAY = 24 * 60 * 60 * 1000;
const DEDUP_SIM = 0.93; // cosine ≥ this AND same type → reinforce, don't insert
const CONTRADICT_SIM = 0.5; // only check contradiction against reasonably-near neighbors

function defaultImportance(type: MemoryType): number {
  if (type === "decision" || type === "gotcha") return 0.7;
  if (type === "convention" || type === "open_thread") return 0.6;
  return 0.5;
}

/**
 * The memory engine: typed memories with dedup, contradiction-driven supersede, and explainable
 * hybrid recall. Solo shape — everything scoped by ctx.projectId; no scopes/classification/trust.
 */
export class MemoryEngine {
  constructor(
    private readonly embedder: { embed(t: string): Promise<number[]> },
    private readonly detector: ContradictionDetector = makeContradictionDetector(),
  ) {}

  /** Add a memory: embed → dedup (reinforce) or insert, superseding any contradicted neighbor. */
  async add(ctx: Ctx, input: AddInput): Promise<AddResult> {
    const content = input.content.trim();
    if (!content) throw new Error("empty_content");
    const type = input.type ?? "fact";
    const importance = clamp01(input.importance ?? defaultImportance(type));
    const vec = await this.embedder.embed(content);
    const emb = isZeroVec(vec) ? null : vec;

    // nearest active neighbors (only meaningful with an embedding)
    const neighbors = emb
      ? (
          await getPool().query(
            `SELECT id, type, content, 1 - (embedding <=> $1::vector) AS sim
               FROM memories
              WHERE project_id = $2 AND status = 'active' AND embedding IS NOT NULL
              ORDER BY embedding <=> $1::vector LIMIT 5`,
            [vecLiteral(vec), ctx.projectId],
          )
        ).rows
      : [];

    // dedup: a very-close same-type neighbor → reinforce it instead of inserting a near-duplicate
    const top = neighbors[0];
    if (top && Number(top.sim) >= DEDUP_SIM && top.type === type) {
      const row = (
        await getPool().query(
          `UPDATE memories
              SET access_count = access_count + 1,
                  importance   = GREATEST(importance, $2),
                  last_verified_at = now(),
                  updated_at = now()
            WHERE id = $1 RETURNING ${COLS}`,
          [top.id, importance],
        )
      ).rows[0];
      await this.version(top.id, row.content, row.importance, row.confidence, "active", "verified", ctx.actor);
      return { memory: rowToMemory(row), deduped: true, superseded: [] };
    }

    // contradiction: a near neighbor that can't both be true now → supersede it
    const superseded: string[] = [];
    for (const n of neighbors.filter((x) => Number(x.sim) >= CONTRADICT_SIM)) {
      if (await this.detector.contradicts(content, n.content)) superseded.push(n.id as string);
    }

    const row = (
      await getPool().query(
        `INSERT INTO memories (project_id, session_id, type, content, embedding, importance, source)
              VALUES ($1, $2, $3, $4, $5::vector, $6, $7) RETURNING ${COLS}`,
        [ctx.projectId, input.sessionId ?? null, type, content, emb ? vecLiteral(emb) : null, importance, input.source ?? ctx.actor ?? null],
      )
    ).rows[0];
    await this.version(row.id, content, importance, 1, "active", "created", ctx.actor);

    for (const oldId of superseded) {
      await getPool().query(
        `UPDATE memories SET status = 'superseded', superseded_by = $2, updated_at = now() WHERE id = $1 AND project_id = $3`,
        [oldId, row.id, ctx.projectId],
      );
      await this.version(oldId, "", null, null, "superseded", "superseded", ctx.actor);
    }

    return { memory: rowToMemory(row), deduped: false, superseded };
  }

  /** Explainable hybrid recall over memories (vector + FTS candidates, blended composite score). */
  async search(ctx: Ctx, input: { query: string; limit?: number; includeStale?: boolean }): Promise<RecallHit[]> {
    const limit = input.limit ?? 8;
    const qvec = await this.embedder.embed(input.query);
    const useVec = !isZeroVec(qvec);
    const statusFilter = input.includeStale
      ? "status NOT IN ('archived','superseded')"
      : "status = 'active'";

    const cands = new Map<string, { row: Record<string, unknown>; sem: number; lex: number }>();

    if (useVec) {
      const r = await getPool().query(
        `SELECT ${COLS}, 1 - (embedding <=> $1::vector) AS sem,
                ts_rank(tsv, plainto_tsquery('english', $2)) AS lex
           FROM memories
          WHERE project_id = $3 AND embedding IS NOT NULL AND ${statusFilter}
          ORDER BY embedding <=> $1::vector LIMIT 40`,
        [vecLiteral(qvec), input.query, ctx.projectId],
      );
      for (const row of r.rows) cands.set(row.id, { row, sem: num(row.sem), lex: num(row.lex) });
    }

    // lexical candidates (also carry semantic when we have a query vector)
    const lexParams = useVec ? [input.query, ctx.projectId, vecLiteral(qvec)] : [input.query, ctx.projectId];
    const r2 = await getPool().query(
      `SELECT ${COLS}, ${useVec ? "1 - (embedding <=> $3::vector)" : "0"} AS sem,
              ts_rank(tsv, plainto_tsquery('english', $1)) AS lex
         FROM memories
        WHERE project_id = $2 AND tsv @@ plainto_tsquery('english', $1) AND ${statusFilter}
        ORDER BY ts_rank(tsv, plainto_tsquery('english', $1)) DESC LIMIT 40`,
      lexParams,
    );
    for (const row of r2.rows) if (!cands.has(row.id)) cands.set(row.id, { row, sem: num(row.sem), lex: num(row.lex) });

    const list = [...cands.values()];
    if (list.length === 0) return [];

    const normSem = normalizeSemantic(list.map((c) => c.sem));
    const normLex = normalizeSemantic(list.map((c) => c.lex));
    const now = Date.now();

    const scored = list.map((c, i) => {
      const m = rowToMemory(c.row);
      const ageMs = now - new Date(m.lastVerifiedAt ?? m.createdAt).getTime();
      // fold lexical into the semantic signal so pure-keyword hits aren't starved
      const semantic = Math.max(normSem[i] ?? 0, (normLex[i] ?? 0) * 0.8);
      const br = recallScore({ semantic, ageMs, importance: m.importance, accessCount: m.accessCount, confidence: m.confidence });
      return { m, br };
    });
    scored.sort((a, b) => b.br.score - a.br.score);
    const top = scored.slice(0, limit);

    if (top.length) {
      await getPool().query(`UPDATE memories SET access_count = access_count + 1 WHERE id = ANY($1::uuid[])`, [
        top.map((s) => s.m.id),
      ]);
    }

    return top.map((s) => ({
      ...s.m,
      __source: "memory" as const,
      __score: round(s.br.score),
      __why: explainRecall(s.br),
      __components: s.br.components as unknown as Record<string, number>,
      __freshness: freshnessOf(s.m, now),
    }));
  }

  async forget(ctx: Ctx, input: { id: string; hard?: boolean }): Promise<{ ok: true }> {
    if (input.hard) {
      await getPool().query(`DELETE FROM memories WHERE id = $1 AND project_id = $2`, [input.id, ctx.projectId]);
      return { ok: true };
    }
    const { rowCount } = await getPool().query(
      `UPDATE memories SET status = 'archived', updated_at = now() WHERE id = $1 AND project_id = $2`,
      [input.id, ctx.projectId],
    );
    if (rowCount) await this.version(input.id, "", null, null, "archived", "archived", ctx.actor);
    return { ok: true };
  }

  async list(ctx: Ctx, opts: { limit?: number; type?: MemoryType } = {}): Promise<Memory[]> {
    const r = await getPool().query(
      `SELECT ${COLS} FROM memories
        WHERE project_id = $1 AND status <> 'archived' ${opts.type ? "AND type = $3" : ""}
        ORDER BY created_at DESC LIMIT $2`,
      opts.type ? [ctx.projectId, opts.limit ?? 50, opts.type] : [ctx.projectId, opts.limit ?? 50],
    );
    return r.rows.map(rowToMemory);
  }

  private async version(
    memoryId: string,
    content: string,
    importance: number | null,
    confidence: number | null,
    status: string,
    change: string,
    actor?: string,
  ): Promise<void> {
    await getPool().query(
      `INSERT INTO memory_versions (memory_id, content, importance, confidence, status, change, actor)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [memoryId, content, importance, confidence, status, change, actor ?? null],
    );
  }
}

export function rowToMemory(r: Record<string, unknown>): Memory {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    sessionId: (r.session_id as string | null) ?? undefined,
    type: r.type as MemoryType,
    content: r.content as string,
    importance: num(r.importance),
    confidence: num(r.confidence),
    status: r.status as Memory["status"],
    supersededBy: (r.superseded_by as string | null) ?? undefined,
    accessCount: Number(r.access_count ?? 0),
    ttlDays: (r.ttl_days as number | null) ?? undefined,
    lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at as string).toISOString() : undefined,
    source: (r.source as string | null) ?? undefined,
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}

function freshnessOf(m: Memory, now: number): Freshness {
  if (m.status === "stale") return "stale";
  const created = new Date(m.createdAt).getTime();
  if (m.ttlDays && created + m.ttlDays * DAY < now) return "stale";
  const ageDays = (now - new Date(m.lastVerifiedAt ?? m.createdAt).getTime()) / DAY;
  if (ageDays > 14) return "aging";
  return "fresh";
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round = (n: number): number => Math.round(n * 1000) / 1000;
