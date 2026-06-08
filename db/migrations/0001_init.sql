-- 0001: tenancy spine — the foundation every later feature hangs off.
-- Runs on postgres + pgvector (image: pgvector/pgvector:pg16). The `vector` extension is
-- deferred until the memory layer migrates in; pgcrypto is needed now for gen_random_uuid().

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Tenancy ───────────────────────────────────────────────────────────────────
CREATE TABLE orgs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  plan       text NOT NULL DEFAULT 'free',           -- free | pro | team
  created_at timestamptz NOT NULL DEFAULT now()
);

-- DOMAIN users (distinct from better-auth's `ba_user`, see 0002). The bridge maps a
-- ba_user.email → this row's org/membership on first login (added with provisioning later).
CREATE TABLE users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  name       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Enforce one tenant per email at the DB (case-insensitive), not just in app code.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE memberships (
  org_id  uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    text NOT NULL DEFAULT 'member',            -- owner | admin | member
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  git_remotes text[] NOT NULL DEFAULT '{}',          -- repo → project auto-map
  state       text NOT NULL DEFAULT 'active'
              CHECK (state IN ('active','near_launch','paused','exploring','archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_git ON projects USING gin(git_remotes);
