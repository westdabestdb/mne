"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signUp.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      name: String(form.get("name") || form.get("email")),
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Could not create account.");
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
        <p className="sub">Create your account.</p>

        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" placeholder="Ada Lovelace" autoComplete="name" />

        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" placeholder="you@team.dev" required autoComplete="email" />

        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" placeholder="min 10 characters" required minLength={10} autoComplete="new-password" />

        {error ? <p className="err">{error}</p> : null}

        <button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </button>

        <p className="row">
          Already have an account?{" "}
          <Link className="link" href="/login">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
