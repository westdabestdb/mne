import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth-server";
import { ApproveDevice } from "./ApproveDevice";

// The browser-approval landing page an agent opens (continuum-style device connect). A logged-in
// human lands here, sees which account they're authorizing, and approves — minting a machine key
// bound to their account (see ./actions). Un-authenticated visitors are bounced to /login and
// returned here afterward (the `state` nonce is preserved through the round-trip).
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="w-full max-w-sm rounded-xl border border-hair bg-panel/40 p-7">
        <h1 className="font-mono text-sm font-medium tracking-[0.18em] text-ink">
          MNEMIA<span className="text-signal">.</span>
        </h1>
        <p className="mt-1 mb-5 text-sm text-muted">Connect a device</p>
        {await renderBody(state)}
      </div>
    </main>
  );
}

async function renderBody(state: string | undefined) {
  if (!state || state.length < 16) {
    return (
      <p className="font-mono text-xs text-cool">
        Missing or invalid connect link. Re-run the authenticate step in your agent.
      </p>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email) {
    // Preserve the state through sign-in, then come straight back here.
    redirect(`/login?next=${encodeURIComponent(`/connect?state=${state}`)}`);
  }

  return <ApproveDevice state={state} email={session.user.email} />;
}

// Always render fresh — the session + pickup state are per-request.
export const dynamic = "force-dynamic";
