"use client";

import { useState } from "react";
import { approveDevice } from "./actions";

type Status = "idle" | "working" | "done" | "error";

export function ApproveDevice({ state, email }: { state: string; email: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setStatus("working");
    setError(null);
    const r = await approveDevice(state);
    if (r.ok) {
      setStatus("done");
    } else {
      setStatus("error");
      setError(r.error ?? "Could not authorize.");
    }
  }

  if (status === "done") {
    return (
      <div className="text-center">
        <p className="font-mono text-sm text-signal">Device authorized.</p>
        <p className="mt-2 text-sm text-muted">
          Return to your coding agent — it&apos;s connected to Mnemia now. You can close this tab.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1 text-sm text-muted">Authorizing as</p>
      <p className="mb-5 font-mono text-sm text-ink">{email}</p>
      <p className="mb-5 text-sm text-muted">
        A coding agent on this machine is asking to connect to your Mnemia account. Approving mints a
        key bound to your account so it can capture and recall memories.
      </p>

      {error ? <p className="mb-3 font-mono text-xs text-cool">{error}</p> : null}

      <button
        onClick={onApprove}
        disabled={status === "working"}
        className="h-11 w-full rounded-md bg-signal font-semibold text-ground transition hover:brightness-110 disabled:opacity-60"
      >
        {status === "working" ? "Authorizing…" : "Authorize this device"}
      </button>
    </div>
  );
}
