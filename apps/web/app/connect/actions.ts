"use server";

import { headers } from "next/headers";
import { ensureAccount, mintApiKey, approvePickup } from "@mnemia/core";
import { auth } from "@/lib/auth-server";

// Approve a waiting agent (MCP/CLI). Runs ONLY for a logged-in human: we re-check the better-auth
// session here (never trust the client), provision their tenancy, mint a machine key bound to it,
// and stash it on the pickup row for the agent's next poll. The token never reaches the browser.
export async function approveDevice(state: string): Promise<{ ok: boolean; error?: string }> {
  if (!state || state.length < 16) return { ok: false, error: "invalid_state" };

  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user?.email;
  if (!email) return { ok: false, error: "not_signed_in" };

  const acct = await ensureAccount(email, { name: session.user.name ?? undefined });
  const key = await mintApiKey(acct.projectId, acct.userId, "mcp device");
  const ok = await approvePickup(state, key.token, acct.projectId, acct.userId);
  return ok ? { ok: true } : { ok: false, error: "expired_or_unknown" };
}
