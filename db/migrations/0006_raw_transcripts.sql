-- 0006: the lossless layer. Distilled memories are compact but lossy; this keeps the ENTIRE
-- session verbatim so "stop today, resume a month later with full context" actually holds.
-- Raw is also the re-distill source-of-truth: re-run extraction over the original any time.
-- Solo shape: plaintext at rest (sealing is Phase 8); blob_ref reserved for future S3/R2 offload.

CREATE TABLE raw_transcripts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid REFERENCES sessions(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  format        text NOT NULL DEFAULT 'text',   -- text | claude_code (JSONL)
  content       text NOT NULL,                  -- plaintext, OR '[encrypted]' placeholder when sealed
  content_cipher bytea,                          -- AES-256-GCM sealed full transcript (when encrypted)
  blob_ref      text,                            -- reserved: S3/R2 key when offloaded
  size_bytes    int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_raw_transcripts_project ON raw_transcripts(project_id, created_at DESC);
CREATE INDEX idx_raw_transcripts_session ON raw_transcripts(session_id);

-- Chunked + embedded spans so hybrid recall can surface raw passages alongside curated memories.
CREATE TABLE transcript_chunks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id  uuid NOT NULL REFERENCES raw_transcripts(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id     uuid REFERENCES sessions(id) ON DELETE SET NULL,
  seq            int  NOT NULL,                 -- order within the transcript
  content        text NOT NULL,                 -- plaintext, OR '[encrypted]' placeholder when sealed
  content_cipher bytea,                          -- AES-256-GCM sealed chunk (when encrypted)
  embedding      vector(384),                   -- computed on PLAINTEXT before sealing
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transcript_chunks_project   ON transcript_chunks(project_id);
CREATE INDEX idx_transcript_chunks_embedding ON transcript_chunks USING hnsw (embedding vector_cosine_ops);
