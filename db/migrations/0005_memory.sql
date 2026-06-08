-- 0005: the memory engine — the core product. Typed memories with explainable hybrid recall,
-- decay/staleness, versioning, supersede-on-contradiction. Solo shape: everything hangs off
-- `projects` (a project belongs to the user's hidden personal org); no scopes/sharing/trust-votes.

CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector: deferred in 0001, needed now for embeddings

-- ── sessions: the unit a capture/checkpoint groups under ─────────────────────────
CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      text,
  repo       text,
  git_branch text,
  source     text,                              -- claude_code | codex | api | manual
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz,
  summary    text
);
CREATE INDEX idx_sessions_project ON sessions(project_id, started_at DESC);

-- ── memories: typed, embedded, decaying, versioned ───────────────────────────────
CREATE TABLE memories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES sessions(id) ON DELETE SET NULL,
  type          text NOT NULL
                CHECK (type IN ('decision','convention','fact','gotcha','reference','open_thread')),
  content       text NOT NULL,
  embedding     vector(384),                     -- local MiniLM; NULL when embedder=none
  tsv           tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  importance    real NOT NULL DEFAULT 0.5,       -- 0..1 caller signal
  confidence    real NOT NULL DEFAULT 1.0,       -- 0..1, decays with age / lowers on dispute
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','stale','archived','superseded')),
  superseded_by uuid REFERENCES memories(id) ON DELETE SET NULL,
  valid_from    timestamptz NOT NULL DEFAULT now(),
  valid_to      timestamptz,
  ttl_days      int,
  last_verified_at timestamptz,
  access_count  int NOT NULL DEFAULT 0,          -- reinforcement: how often recalled
  source        text,                            -- which agent wrote it
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_memories_project   ON memories(project_id);
CREATE INDEX idx_memories_status    ON memories(project_id, status);
CREATE INDEX idx_memories_tsv       ON memories USING gin(tsv);
CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);

-- ── memory_versions: history; supersede is an op, never a destructive overwrite ───
CREATE TABLE memory_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id  uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  content    text NOT NULL,
  importance real,
  confidence real,
  status     text,
  change     text NOT NULL,                      -- created|updated|superseded|verified|decayed|archived
  actor      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_memory_versions_memory ON memory_versions(memory_id, created_at);

-- ── checkpoints: agent-neutral session snapshot (files/branch/plan/todos/threads) ─
CREATE TABLE checkpoints (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'full' CHECK (kind IN ('full','partial')),
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_checkpoints_session ON checkpoints(session_id, created_at DESC);
