import { getPool } from "./db.js";
import { hashApiKey, isApiKey } from "./crypto.js";

// ── Machine-plane key resolution ─────────────────────────────────────────────────
// Resolve a Bearer `mnem_live_*` key to its bound context. projectId/orgId/userId come from the
// KEY (a key is bound to one project), never from the request body — so a caller can't reach
// another tenant's data by passing a different projectId. Returns null → 401.

export interface KeyContext {
  keyId: string;
  scopes: string[];
  projectId: string;
  orgId: string;
  userId?: string;
}

export async function resolveApiKey(authHeader: string | undefined): Promise<KeyContext | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!isApiKey(token)) return null;
  const { rows } = await getPool().query(
    `SELECT k.id, k.project_id, k.user_id, k.scopes, k.revoked_at, pr.org_id
       FROM api_keys k JOIN projects pr ON pr.id = k.project_id
      WHERE k.key_hash = $1`,
    [hashApiKey(token)],
  );
  const k = rows[0];
  if (!k || k.revoked_at) return null;
  // fire-and-forget last_used_at bump
  void getPool().query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [k.id]).catch(() => {});
  return {
    keyId: k.id as string,
    scopes: (k.scopes as string[]) ?? [],
    projectId: k.project_id as string,
    orgId: k.org_id as string,
    userId: (k.user_id as string | null) ?? undefined,
  };
}
