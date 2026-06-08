import type pg from "pg";
import { getPool, withTx } from "./db.js";
import { generateApiKey } from "./crypto.js";

// ── Shared account provisioning — ONE source of truth for org/project/first-key ──
//
// The web dashboard (better-auth → first device approval) provisions the mnemia tenancy shape
// for an email: an org + an owner user + a default project (+ a first API key on first mint).
// Keyed on the DOMAIN users.email so it is idempotent: called twice with the same email it
// returns the SAME org/user/project (no duplicate org, no duplicate membership).
//
// SCOPE (this build): orgs + users + memberships + projects only. Scopes, audit_log, seat
// limits and the SSO domain-join path migrate in with later phases — this is the minimal
// tenancy needed to mint a machine key bound to a real account.
//
// Passwords are NOT touched here: the human password lives in better-auth's ba_account; the
// domain `users` row carries no password in this build (machine plane authenticates by key).

export interface AccountContext {
  userId: string;
  orgId: string;
  projectId: string;
  /** True when this call created the org (first-ever provisioning for the email). */
  created: boolean;
}

export interface EnsureAccountOptions {
  /** Project to ensure on first provisioning. Ignored once the org already exists. */
  projectName?: string;
  /** Display name for the user row (only set when the user row is first created). */
  name?: string;
  /** Run inside an existing transaction (caller-managed). Default: open a new tx. */
  client?: pg.PoolClient;
}

async function run(c: pg.PoolClient, email: string, opts: EnsureAccountOptions): Promise<AccountContext> {
  const projectName = opts.projectName || "default";

  // 1) Resolve (or create) the domain user by email — the idempotency key.
  const existingUser = (await c.query(`SELECT id FROM users WHERE lower(email) = $1`, [email])).rows[0];

  if (existingUser) {
    const userId = existingUser.id as string;
    const m = (await c.query(
      `SELECT org_id FROM memberships WHERE user_id = $1 ORDER BY org_id LIMIT 1`,
      [userId],
    )).rows[0];
    const orgId = (m?.org_id as string | undefined) ?? (await createOrgFor(c, userId, email));
    const projectId = await firstOrCreateProject(c, orgId, projectName);
    return { userId, orgId, projectId, created: false };
  }

  // 2) First-ever provisioning for this email: own org, owner membership, default project.
  const userId = (await c.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [email, opts.name ?? null],
  )).rows[0].id as string;
  const orgId = await createOrgFor(c, userId, email);
  const projectId = await firstOrCreateProject(c, orgId, projectName);
  return { userId, orgId, projectId, created: true };
}

async function createOrgFor(c: pg.PoolClient, userId: string, email: string): Promise<string> {
  const orgId = (await c.query(
    `INSERT INTO orgs (name, plan) VALUES ($1, 'free') RETURNING id`,
    [`${email} org`],
  )).rows[0].id as string;
  await c.query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (org_id, user_id) DO NOTHING`,
    [orgId, userId],
  );
  return orgId;
}

async function firstOrCreateProject(c: pg.PoolClient, orgId: string, projectName: string): Promise<string> {
  return (
    (await c.query(`SELECT id FROM projects WHERE org_id = $1 ORDER BY created_at LIMIT 1`, [orgId]))
      .rows[0]?.id as string | undefined
  ) ?? ((await c.query(
    `INSERT INTO projects (org_id, name) VALUES ($1, $2) RETURNING id`,
    [orgId, projectName],
  )).rows[0].id as string);
}

/**
 * Idempotently ensure the tenancy for an email and return its context.
 * Runs in a transaction (its own, or a caller-supplied client).
 */
export async function ensureAccount(email: string, opts: EnsureAccountOptions = {}): Promise<AccountContext> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) throw new Error("invalid_email");
  if (opts.client) return run(opts.client, normalized, opts);
  return withTx((cl) => run(cl, normalized, opts));
}

/** Normalize a git remote to a stable key (strip protocol/credentials/.git, lowercase host/path). */
export function normalizeGitRemote(remote: string): string {
  let s = remote.trim();
  s = s.replace(/^git@([^:]+):/, "https://$1/"); // scp-style → url
  s = s.replace(/^ssh:\/\//, "https://").replace(/^git:\/\//, "https://");
  s = s.replace(/\.git$/, "");
  try {
    const u = new URL(s);
    return `${u.host}${u.pathname}`.toLowerCase().replace(/\/+$/, "");
  } catch {
    return s.toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Resolve the project for a repo within an org, creating it on first sight (per-repo auto-provision:
 * no project picker, no key paste). The normalized remote is matched against projects.git_remotes.
 */
export async function resolveOrCreateProjectByRepo(orgId: string, repo: string): Promise<string> {
  const norm = normalizeGitRemote(repo);
  const found = await getPool().query(
    `SELECT id FROM projects WHERE org_id = $1 AND EXISTS (
        SELECT 1 FROM unnest(git_remotes) g WHERE lower(regexp_replace(g, '\\.git$', '')) LIKE '%' || $2 || '%'
     ) ORDER BY created_at LIMIT 1`,
    [orgId, norm],
  );
  if (found.rows[0]) return found.rows[0].id as string;
  const name = norm.split("/").pop() || "default";
  const row = await getPool().query(
    `INSERT INTO projects (org_id, name, git_remotes) VALUES ($1, $2, ARRAY[$3]) RETURNING id`,
    [orgId, name, norm],
  );
  return row.rows[0].id as string;
}

/** Mint a machine key for a project. The plaintext token is returned ONCE. */
export async function mintApiKey(
  projectId: string,
  userId: string | undefined,
  name = "key",
): Promise<{ token: string; prefix: string }> {
  const key = generateApiKey();
  await getPool().query(
    `INSERT INTO api_keys (project_id, user_id, name, prefix, key_hash, scopes)
       VALUES ($1, $2, $3, $4, $5, '{read,write}')`,
    [projectId, userId ?? null, name, key.prefix, key.hash],
  );
  return { token: key.token, prefix: key.prefix };
}
