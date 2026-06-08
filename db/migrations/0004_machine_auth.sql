-- 0004: machine auth plane — API keys + the browser-approval pickup bridge.
--
-- Two planes, kept apart:
--   • HUMAN plane  → better-auth (ba_*, migration 0002): web dashboard sessions + passwords.
--   • MACHINE plane → THIS migration: `mnem_live_*` API keys that agents/MCP/CLI carry.
--
-- They meet exactly once, at AUTH time: a human signs in to the web (better-auth), approves a
-- waiting agent, and the server MINTS a machine key bound to that human's org/project. From then
-- on the agent authenticates with the key alone — no human session involved.

-- ── api_keys: the machine credential ────────────────────────────────────────────
-- A key is bound to ONE project (and the minting user). We store only sha256(token + pepper),
-- never the plaintext — the token is shown to the holder exactly once at mint time.
CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,  -- who minted it (nullable on user delete)
  name         text NOT NULL DEFAULT 'key',
  prefix       text NOT NULL,                                 -- display-only fragment, e.g. mnem_live_AbCd…
  key_hash     text NOT NULL UNIQUE,                          -- sha256(token + MNEMIA_API_KEY_PEPPER)
  scopes       text[] NOT NULL DEFAULT '{read,write}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX idx_api_keys_project ON api_keys(project_id);

-- ── oauth_pickups: the one-time browser-approval handoff ─────────────────────────
-- The MCP/CLI generates a high-entropy `state`, opens the web /connect?state=… page, and polls.
-- A logged-in human approves there; the server stashes a freshly-minted key token on the row.
-- The agent polls once, reads the token, and the server nulls it (replay-safe). Short TTL.
--
-- NOT tenant-scoped by design: the `state` nonce IS the capability. Rows expire fast.
CREATE TABLE oauth_pickups (
  state      text PRIMARY KEY,                                -- CLI/MCP-chosen nonce (>=16 chars)
  token      text,                                            -- minted mnem_live_ key, lives until first poll
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  authorized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
