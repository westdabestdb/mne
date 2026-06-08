// Thin HTTP client for the Mnemia REST API (apps/api). Node fetch only — no deps.

export interface OauthStartResponse {
  authorizeUrl: string;
  interval: number;
  expiresInSec: number;
}

export interface OauthPollResponse {
  status: "pending" | "authorized" | "expired" | "unknown";
  token?: string;
  projectId?: string;
  apiUrl?: string;
}

export async function startOauth(apiUrl: string, state: string): Promise<OauthStartResponse> {
  return post<OauthStartResponse>(apiUrl, "oauth/start", { state });
}

export async function pollOauth(apiUrl: string, state: string): Promise<OauthPollResponse> {
  return post<OauthPollResponse>(apiUrl, "oauth/pickup", { state });
}

export async function getMe(apiUrl: string, token: string): Promise<{ userId: string | null; orgId: string; projectId: string }> {
  const res = await fetch(`${apiUrl}/v1/me`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`api me failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { userId: string | null; orgId: string; projectId: string };
}

// ── authenticated data-plane calls used by the auto-capture hooks ──────────────────
export function archiveRaw(
  apiUrl: string,
  token: string,
  body: { text: string; format?: string; repo?: string },
): Promise<{ transcriptId: string; chunks: number; session?: { id: string } }> {
  return authed(apiUrl, token, "archive", body);
}

export function reDistill(
  apiUrl: string,
  token: string,
  body: { transcriptId?: string; sessionId?: string; capture?: boolean; repo?: string },
): Promise<{ captured?: number }> {
  return authed(apiUrl, token, "re_distill", body);
}

export function resume(apiUrl: string, token: string, body: { repo?: string }): Promise<{ brief?: string }> {
  return authed(apiUrl, token, "resume", body);
}

async function authed<T>(apiUrl: string, token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiUrl}/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`api ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function post<T>(apiUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiUrl}/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`api ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
