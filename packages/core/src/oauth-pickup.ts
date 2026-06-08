import { getPool } from "./db.js";

// ── Browser-approval pickup bridge ───────────────────────────────────────────────
//
// The OAuth-style handoff that lets an agent (MCP/CLI) authenticate as a real web account
// WITHOUT the agent ever seeing the human's password:
//
//   1. The agent generates a `state` nonce and calls openPickup(state) via the API.
//   2. It opens the web /connect?state=… page and POLLs pollPickup(state).
//   3. A logged-in human approves there; the web MINTS a key and calls approvePickup(state, …).
//   4. The next poll returns the token EXACTLY ONCE, then the server nulls it (replay-safe).

export interface PickupResult {
  status: "pending" | "authorized" | "expired" | "unknown";
  token?: string;
  projectId?: string;
}

/** Reserve a pickup slot for an agent-generated `state` nonce. Idempotent on the state PK. */
export async function openPickup(state: string): Promise<void> {
  if (!state || state.length < 16) throw new Error("invalid_state");
  await getPool().query(
    `INSERT INTO oauth_pickups (state) VALUES ($1) ON CONFLICT (state) DO NOTHING`,
    [state],
  );
}

/**
 * Approve a pickup: stash the freshly-minted token bound to the approving user's project, and
 * mark authorized. Returns false when the state is unknown/expired (the approval can't proceed).
 */
export async function approvePickup(
  state: string,
  token: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE oauth_pickups
        SET token = $2, project_id = $3, user_id = $4, authorized = true
      WHERE state = $1 AND expires_at > now()`,
    [state, token, projectId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** Poll a pickup. Hands the token to the agent exactly once, then nulls it (replay-safe). */
export async function pollPickup(state: string): Promise<PickupResult> {
  const { rows } = await getPool().query(
    `SELECT token, project_id, authorized, expires_at FROM oauth_pickups WHERE state = $1`,
    [state],
  );
  const p = rows[0];
  if (!p) return { status: "unknown" };
  if (new Date(p.expires_at).getTime() < Date.now()) return { status: "expired" };
  if (!p.authorized) return { status: "pending" };
  if (p.token) {
    await getPool().query(`UPDATE oauth_pickups SET token = NULL WHERE state = $1`, [state]);
  }
  return { status: "authorized", token: p.token ?? undefined, projectId: p.project_id ?? undefined };
}
