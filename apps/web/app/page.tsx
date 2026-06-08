import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth-server";
import { SignOutButton } from "./sign-out-button";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <main>
      <div className="card">
        <h1>
          Mnemia<span className="brand">.</span>
        </h1>
        <p className="sub">Portable, shareable, correct agent memory.</p>

        {session ? (
          <>
            <p className="muted">
              Signed in as <strong>{session.user.email}</strong>.
            </p>
            <SignOutButton />
          </>
        ) : (
          <>
            <Link className="link" href="/login">
              Sign in
            </Link>
            <span className="muted"> · </span>
            <Link className="link" href="/signup">
              Create an account
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
