// ── Public types for the memory engine ───────────────────────────────────────────

export type MemoryType = "decision" | "convention" | "fact" | "gotcha" | "reference" | "open_thread";
export type MemoryStatus = "active" | "stale" | "archived" | "superseded";

/** The authenticated routing context a key resolves to (solo: org is the hidden personal org). */
export interface Ctx {
  projectId: string;
  actor?: string;
  userId?: string;
}

export interface Memory {
  id: string;
  projectId: string;
  sessionId?: string;
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
  status: MemoryStatus;
  supersededBy?: string;
  accessCount: number;
  ttlDays?: number;
  lastVerifiedAt?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddInput {
  content: string;
  type?: MemoryType;
  importance?: number;
  source?: string;
  sessionId?: string;
  ttlDays?: number;
}

export interface AddResult {
  memory: Memory;
  /** True when the input matched an existing memory and reinforced it instead of inserting. */
  deduped: boolean;
  /** Ids of memories this one superseded (contradiction-driven). */
  superseded: string[];
}

export type Freshness = "fresh" | "aging" | "stale";

/** A recall hit: the memory plus the explainable ranking metadata. */
export interface RecallHit extends Memory {
  __source: "memory";
  __score: number;
  __why: string;
  __components: Record<string, number>;
  __freshness: Freshness;
}

/** A raw transcript span surfaced by hybrid recall (down-weighted vs curated memories). */
export interface RawHit {
  __source: "raw";
  __score: number;
  __why: string;
  content: string;
  transcriptId: string;
  sessionId?: string;
  seq: number;
}

export type HybridHit = RecallHit | RawHit;

export interface SearchInput {
  query: string;
  limit?: number;
  includeStale?: boolean;
  /** Include raw transcript spans alongside curated memories (hybrid recall). Default true. */
  includeRaw?: boolean;
}

/** The stored verbatim transcript for a session. */
export interface TranscriptDoc {
  id: string;
  sessionId?: string;
  projectId: string;
  format: string;
  content: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ArchiveResult {
  transcriptId: string;
  chunks: number;
  sessionId?: string;
}

export interface DistilledMemory {
  content: string;
  type: MemoryType;
  importance: number;
}

export interface CaptureItem {
  content: string;
  type?: MemoryType;
  importance?: number;
}

export interface Session {
  id: string;
  projectId: string;
  title?: string;
  repo?: string;
  gitBranch?: string;
  source?: string;
  startedAt: string;
  endedAt?: string;
  summary?: string;
}

export type CheckpointKind = "full" | "partial";

export interface CheckpointPayload {
  files?: string[];
  branch?: string;
  plan?: string;
  todos?: string[];
  openThreads?: string[];
  pinnedSpans?: { label: string; content: string }[];
  [k: string]: unknown;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  projectId: string;
  kind: CheckpointKind;
  payload: CheckpointPayload;
  createdAt: string;
}

export interface ResumeResult {
  session?: Session;
  memories: HybridHit[];
  checkpoint: Checkpoint | null;
  brief: string;
}

/** Pluggable embedder. Embedding happens server-side so memories from any agent are comparable. */
export interface Embedder {
  readonly dim: number;
  embed(text: string): Promise<number[]>;
}
