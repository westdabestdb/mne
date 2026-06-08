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
    <main className="flex min-h-screen items-center justify-center bg-ground px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-hair bg-panel/40 p-7">
        <h1 className="font-mono text-sm font-medium tracking-[0.18em] text-ink">
          MNEMIA<span className="text-signal">.</span>
        </h1>
        <p className="mt-1 mb-5 text-sm text-muted">Sign in to your team&apos;s brain.</p>

        <label className="mb-1 block font-mono text-xs uppercase tracking-wide text-faint" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="you@team.dev"
          required
          autoComplete="email"
          className="h-11 w-full rounded-md border border-hair bg-ground px-3 text-ink outline-none transition placeholder:text-faint focus:border-signal/60 focus:ring-1 focus:ring-signal/40"
        />

        <label className="mb-1 mt-4 block font-mono text-xs uppercase tracking-wide text-faint" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="password"
          required
          autoComplete="current-password"
          className="h-11 w-full rounded-md border border-hair bg-ground px-3 text-ink outline-none transition placeholder:text-faint focus:border-signal/60 focus:ring-1 focus:ring-signal/40"
        />

        {error ? <p className="mt-3 font-mono text-xs text-cool">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 h-11 w-full rounded-md bg-signal font-semibold text-ground transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-sm text-muted">
          No account?{" "}
          <Link href="/signup" className="text-signal transition hover:brightness-110">
            Create one
          </Link>
        </p>
      </form>
    </main>
  );
}
