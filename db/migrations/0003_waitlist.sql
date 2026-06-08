-- 0003: landing-page waitlist (invite-only access requests).
-- Replaces the old file-based .waitlist.json store — a flat file doesn't persist on
-- serverless/cloud. email is the PK so re-requests dedupe via ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS waitlist (
  email      text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
