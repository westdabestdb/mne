"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main>
      <form className="card" onSubmit={onSubmit}>
        <h1>
          Mnemia<span className="brand">.</span>
        </h1>
        <p className="sub">Sign in to your team&apos;s brain.</p>

        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" placeholder="you@team.dev" required autoComplete="email" />

        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" placeholder="password" required autoComplete="current-password" />

        {error ? <p className="err">{error}</p> : null}

        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <p className="row">
          No account?{" "}
          <Link className="link" href="/signup">
            Create one
          </Link>
        </p>
      </form>
    </main>
  );
}
