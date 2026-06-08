import { createHash, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";

// ── API key crypto ───────────────────────────────────────────────────────────────
// A key is a random secret shown ONCE; we persist sha256(secret + pepper), never the
// plaintext. Format `mnem_live_<base64url-32>`. The hash column is unique-indexed for
// O(1) lookup. (Envelope encryption for memory content migrates in with Phase 8.)

export interface GeneratedKey {
  token: string; // full secret — shown to the user once
  prefix: string; // display-only fragment, e.g. mnem_live_AbCd…
  hash: string; // sha256(token + pepper) — what we persist
}

const KEY_PREFIX = "mnem_live_";

export function generateApiKey(): GeneratedKey {
  const secret = randomBytes(24).toString("base64url"); // 32 chars
  const token = `${KEY_PREFIX}${secret}`;
  return { token, prefix: `${token.slice(0, 14)}…`, hash: hashApiKey(token) };
}

/** Peppered sha256-hex of a high-entropy secret. The pepper (MNEMIA_API_KEY_PEPPER) is
 *  never stored — only this hash is. An empty pepper defeats hashing, so we fail fast (below). */
function pepperedSha256(secret: string): string {
  const pepper = process.env.MNEMIA_API_KEY_PEPPER ?? "";
  return createHash("sha256").update(secret + pepper).digest("hex");
}

export function hashApiKey(token: string): string {
  return pepperedSha256(token);
}

/** Fail fast at boot if the key pepper is missing — an empty pepper defeats hashing. */
export function assertPepperConfigured(): void {
  if (!process.env.MNEMIA_API_KEY_PEPPER) {
    throw new Error("MNEMIA_API_KEY_PEPPER must be set to a non-empty value");
  }
}

export function isApiKey(token: string | undefined): token is string {
  return !!token && token.startsWith(KEY_PREFIX);
}

/** Constant-time hex-hash compare (lookups go by unique hash, but compare safely too). */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

// ── Envelope encryption at rest (AES-256-GCM) ──────────────────────────────────────
// Used for the sensitive raw-transcript layer. Single master key (solo); a per-org DEK can
// layer on later. Opt-in: when MNEMIA_MASTER_KEK is set we encrypt; in production, callers
// (transcripts.archive) REFUSE to store plaintext, so prod can't accidentally ship unsealed.
// Embeddings are computed on plaintext BEFORE sealing, so semantic recall is unaffected.

/** Placeholder left in the plaintext column when the real content is sealed in *_cipher. */
export const ENCRYPTED_PLACEHOLDER = "[encrypted]";

export function encryptionEnabled(): boolean {
  return !!process.env.MNEMIA_MASTER_KEK;
}

function masterKey(): Buffer {
  const b64 = process.env.MNEMIA_MASTER_KEK;
  if (!b64) throw new Error("MNEMIA_MASTER_KEK required (32 bytes base64)");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("MNEMIA_MASTER_KEK must be 32 bytes (base64-encoded)");
  return k;
}

/** Seal UTF-8 text → iv(12) | tag(16) | ciphertext. */
export function seal(plaintext: string): Buffer {
  const key = masterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

/** Open a sealed blob back to UTF-8 text. */
export function open(blob: Buffer): string {
  const key = masterKey();
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
