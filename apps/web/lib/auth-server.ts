import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";

// ── better-auth: the HUMAN session plane for the web dashboard ───────────────────
//
// better-auth owns human sessions + password hashing. Its tables live in their OWN `ba_`
// namespace (db/migrations/0002) so they never collide with the DOMAIN `users` table. The
// email → org/membership bridge (provisioning) migrates in as a later step.

// Require a real secret in production; a known dev fallback would let anyone forge sessions.
let warnedSecret = false;
const INSECURE_SECRETS =
  /^(replace_me|dev-insecure-secret|changeme|change_me|secret|password|placeholder|__.*__)$/i;

function authSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  const prod = process.env.NODE_ENV === "production";
  if (prod && (!s || s.length < 32 || INSECURE_SECRETS.test(s))) {
    throw new Error(
      "BETTER_AUTH_SECRET must be a strong (>=32 char), non-placeholder value in production",
    );
  }
  if (s && !INSECURE_SECRETS.test(s)) return s;
  if (!warnedSecret) {
    warnedSecret = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[mnemia] BETTER_AUTH_SECRET unset or placeholder — using an INSECURE dev fallback. Do NOT use in production.",
    );
  }
  return "dev-insecure-secret";
}

// Same Postgres as everything else (one DB). better-auth uses the pg Pool directly.
export const authPool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://mnemia:mnemia@localhost:5432/mnemia",
});

export const auth = betterAuth({
  database: authPool,
  secret: authSecret(),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 10,
  },
  // Keep better-auth OFF the domain `users` table — prefix every table with `ba_`.
  user: { modelName: "ba_user" },
  session: { modelName: "ba_session" },
  account: { modelName: "ba_account" },
  verification: { modelName: "ba_verification" },
  // nextCookies() MUST be last so it can attach Set-Cookie from server actions / handlers.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
