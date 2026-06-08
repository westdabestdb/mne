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

async function post<T>(apiUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiUrl}/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`api ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
