// @mnemia/core — capture, recall, hygiene over one Postgres.
export { getPool, closePool, withTx } from "./db.js";

// Machine-auth plane (API keys + browser-approval pickup + tenancy provisioning).
export { generateApiKey, hashApiKey, assertPepperConfigured, isApiKey, safeEqualHex } from "./crypto.js";
export { seal, open, encryptionEnabled, ENCRYPTED_PLACEHOLDER } from "./crypto.js";
export type { GeneratedKey } from "./crypto.js";
export { ensureAccount, mintApiKey, resolveOrCreateProjectByRepo, normalizeGitRemote } from "./provisioning.js";
export type { AccountContext, EnsureAccountOptions } from "./provisioning.js";
export { openPickup, approvePickup, pollPickup } from "./oauth-pickup.js";
export type { PickupResult } from "./oauth-pickup.js";
export { resolveApiKey } from "./auth.js";
export type { KeyContext } from "./auth.js";

// Memory engine.
export { MemoryEngine, rowToMemory } from "./memory.js";
export { CaptureEngine, synthesizeBrief } from "./capture.js";
export { makeEmbedder, LocalEmbedder, OpenAIEmbedder, NullEmbedder } from "./embedder.js";
export { HeuristicDistiller } from "./distiller.js";
export { makeContradictionDetector, HeuristicContradictionDetector, NullContradictionDetector } from "./contradiction.js";
export {
  recallScore, explainRecall, normalizeSemantic, accessScore, recencyScore,
  DEFAULT_WEIGHTS, DEFAULT_HALF_LIFE_MS, DEFAULT_IMPORTANCE_HALF_LIFE_MS,
} from "./recall.js";
export { archiveTranscript, getTranscript, searchTranscriptChunks, chunkText, flattenForEmbedding } from "./transcripts.js";

export type * from "./types.js";
