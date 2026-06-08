"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Something went wrong.");
      setStatus("success");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <div className="flex items-center gap-3 font-mono text-sm">
        <span className="h-2 w-2 rounded-full bg-signal shadow-[0_0_12px_var(--color-signal)]" />
        <span className="text-ink">on the list. we will reach out.</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@team.dev"
          aria-label="Work email"
          className="h-12 flex-1 rounded-md border border-hair bg-panel px-4 font-mono text-[0.95rem] text-ink outline-none transition placeholder:text-faint focus:border-signal/60 focus:ring-1 focus:ring-signal/40"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="h-12 shrink-0 rounded-md bg-signal px-6 text-[0.95rem] font-semibold text-ground transition hover:brightness-110 disabled:opacity-60"
        >
          {status === "loading" ? "joining…" : "Request access"}
        </button>
      </div>
      <p
        className={`mt-2.5 font-mono text-xs tracking-wide ${
          status === "error" ? "text-cool" : "text-faint"
        }`}
      >
        {status === "error" ? message : "early access · no spam, ever"}
      </p>
    </form>
  );
}
