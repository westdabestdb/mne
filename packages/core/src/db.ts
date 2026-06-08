import pg from "pg";

// ── Single-Postgres connection layer ─────────────────────────────────────────
// One pool for the whole engine. RLS enforcement (withRls + the mnemia_app role) and the
// pgvector type wiring migrate in alongside the memory layer; for now this is a plain pool.

let pool: pg.Pool | null = null;

export function getPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (pool) return pool;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  pool = new pg.Pool({ connectionString, max: 10 });
  return pool;
}

/** Close the pool (tests / graceful shutdown). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Run `fn` inside a transaction; COMMIT on success, ROLLBACK on throw. */
export async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
