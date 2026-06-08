import { Pool } from "pg";

// Shared pg pool for the web app's DOMAIN queries (waitlist now; dashboard reads later).
// Kept separate from auth-server's authPool by concern — that pool is the better-auth plane.
// Same single Postgres (DATABASE_URL) either way.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://mnemia:mnemia@localhost:5432/mnemia",
});
