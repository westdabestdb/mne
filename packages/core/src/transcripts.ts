import { getPool } from "./db.js";
import { vecLiteral, isZeroVec } from "./vec.js";
import { seal, open, encryptionEnabled, ENCRYPTED_PLACEHOLDER } from "./crypto.js";
import type { Ctx, ArchiveResult, TranscriptDoc, Embedder } from "./types.js";

// ── Raw transcript archive — the lossless layer ────────────────────────────────────
// Stores a session verbatim (sealed at rest when MNEMIA_MASTER_KEK is set) and chunk-embeds it
// so hybrid recall can surface raw spans. Embeddings are computed on PLAINTEXT before sealing.

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;
const MAX_BYTES = Number(process.env.MNEMIA_MAX_TRANSCRIPT_BYTES ?? 10 * 1024 * 1024);

export interface RawChunk {
  content: string;
  transcriptId: string;
  sessionId?: string;
  seq: number;
  sim: number;
}

/** Store a session's full transcript + chunk-embed it. Refuses plaintext in production. */
export async function archiveTranscript(
  ctx: Ctx,
  embedder: Embedder,
  input: { text: string; format?: string; sessionId?: string },
): Promise<ArchiveResult> {
  const text = input.text ?? "";
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new Error("transcript_too_large");
  const format = input.format ?? "text";

  const sealed = encryptionEnabled();
  if (!sealed && process.env.NODE_ENV === "production") {
    throw new Error("MNEMIA_MASTER_KEK required to archive transcripts in production");
  }

  const raw = (
    await getPool().query(
      `INSERT INTO raw_transcripts (session_id, project_id, format, content, content_cipher, size_bytes)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        input.sessionId ?? null,
        ctx.projectId,
        format,
        sealed ? ENCRYPTED_PLACEHOLDER : text,
        sealed ? seal(text) : null,
        Buffer.byteLength(text, "utf8"),
      ],
    )
  ).rows[0];
  const transcriptId = raw.id as string;

  const flat = flattenForEmbedding(text, format);
  const chunks = chunkText(flat);
  let seq = 0;
  for (const chunk of chunks) {
    const vec = await embedder.embed(chunk);
    const emb = isZeroVec(vec) ? null : vec;
    await getPool().query(
      `INSERT INTO transcript_chunks (transcript_id, project_id, session_id, seq, content, content_cipher, embedding)
            VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
      [
        transcriptId,
        ctx.projectId,
        input.sessionId ?? null,
        seq++,
        sealed ? ENCRYPTED_PLACEHOLDER : chunk,
        sealed ? seal(chunk) : null,
        emb ? vecLiteral(emb) : null,
      ],
    );
  }

  return { transcriptId, chunks: chunks.length, sessionId: input.sessionId };
}

/** Fetch the verbatim transcript for a session (or by id), decrypting if sealed. */
export async function getTranscript(
  ctx: Ctx,
  input: { sessionId?: string; transcriptId?: string },
): Promise<TranscriptDoc> {
  const where = input.transcriptId ? "id = $2" : "session_id = $2";
  const key = input.transcriptId ?? input.sessionId;
  if (!key) throw new Error("session_or_transcript_required");
  const r = await getPool().query(
    `SELECT id, session_id, project_id, format, content, content_cipher, size_bytes, created_at
       FROM raw_transcripts WHERE project_id = $1 AND ${where}
      ORDER BY created_at DESC LIMIT 1`,
    [ctx.projectId, key],
  );
  const row = r.rows[0];
  if (!row) throw new Error("transcript_not_found");
  return {
    id: row.id as string,
    sessionId: (row.session_id as string | null) ?? undefined,
    projectId: row.project_id as string,
    format: row.format as string,
    content: row.content_cipher ? open(row.content_cipher as Buffer) : (row.content as string),
    sizeBytes: Number(row.size_bytes ?? 0),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

/** Semantic search over stored transcript chunks (raw spans for hybrid recall). */
export async function searchTranscriptChunks(
  ctx: Ctx,
  embedder: Embedder,
  input: { query: string; limit?: number },
): Promise<RawChunk[]> {
  const limit = input.limit ?? 5;
  const qvec = await embedder.embed(input.query);
  if (isZeroVec(qvec)) return []; // raw recall is semantic-only (content may be sealed)
  const r = await getPool().query(
    `SELECT id, transcript_id, session_id, seq, content, content_cipher,
            1 - (embedding <=> $1::vector) AS sim
       FROM transcript_chunks
      WHERE project_id = $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector LIMIT $3`,
    [vecLiteral(qvec), ctx.projectId, limit],
  );
  return r.rows.map((row) => ({
    content: row.content_cipher ? open(row.content_cipher as Buffer) : (row.content as string),
    transcriptId: row.transcript_id as string,
    sessionId: (row.session_id as string | null) ?? undefined,
    seq: Number(row.seq ?? 0),
    sim: Number(row.sim ?? 0),
  }));
}

/** Sliding-window character chunks with overlap. */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const t = text.trim();
  if (!t) return [];
  const step = Math.max(1, size - overlap);
  const out: string[] = [];
  for (let i = 0; i < t.length; i += step) out.push(t.slice(i, i + size));
  return out;
}

/** Flatten a transcript to readable text for embedding. claude_code = JSONL of messages. */
export function flattenForEmbedding(content: string, format: string): string {
  if (format !== "claude_code") return content;
  const parts: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line) as Record<string, unknown>;
      const role = (o.role as string) ?? (o.type as string) ?? "";
      const text = extractText(o);
      if (text) parts.push(role ? `${role}: ${text}` : text);
    } catch {
      /* skip non-JSON lines */
    }
  }
  return parts.join("\n\n") || content;
}

function extractText(o: Record<string, unknown>): string {
  const msg = (o.message as Record<string, unknown>) ?? o;
  const c = msg.content ?? o.content ?? o.text;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((p) => (typeof p === "string" ? p : ((p as Record<string, unknown>)?.text as string) ?? ""))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}
