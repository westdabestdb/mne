import type { Embedder } from "./types.js";

/**
 * Pluggable embedders. Default = local (privacy, no API cost, offline).
 *   - local : transformers.js MiniLM (384-dim), fully offline after first download
 *   - openai: hosted, higher quality, opt-in
 *   - none  : FTS-only (zero-vector) — dev/tests without the model download
 *
 * Embedding happens server-side at capture/recall, so a Claude-distilled memory and a Codex
 * query embed with the SAME model → cosine-comparable across agents.
 */
export function makeEmbedder(): Embedder {
  const mode = process.env.MNEMIA_EMBEDDER ?? "local";
  const dim = Number(process.env.MNEMIA_EMBED_DIM ?? 384);
  if (mode === "openai") return new OpenAIEmbedder(dim);
  if (mode === "none") return new NullEmbedder(dim);
  return new LocalEmbedder(dim);
}

/** Local semantic embedder — all-MiniLM-L6-v2 (384-dim). Lazy-loads on first embed. */
export class LocalEmbedder implements Embedder {
  private pipe: Promise<unknown> | null = null;
  constructor(readonly dim: number) {}

  private load(): Promise<unknown> {
    if (!this.pipe) {
      this.pipe = import("@xenova/transformers").then(({ pipeline, env }) => {
        env.allowLocalModels = true;
        return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      });
    }
    return this.pipe;
  }

  async embed(text: string): Promise<number[]> {
    const extractor = (await this.load()) as (
      t: string,
      o: { pooling: string; normalize: boolean },
    ) => Promise<{ data: Float32Array }>;
    const out = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(out.data);
  }
}

export class OpenAIEmbedder implements Embedder {
  constructor(readonly dim: number) {}
  async embed(text: string): Promise<number[]> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY required for openai embedder");
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text, dimensions: this.dim }),
    });
    if (!res.ok) throw new Error(`embedding failed: ${res.status}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data[0]!.embedding;
  }
}

export class NullEmbedder implements Embedder {
  constructor(readonly dim: number) {}
  async embed(): Promise<number[]> {
    return new Array(this.dim).fill(0);
  }
}
