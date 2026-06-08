// pgvector literal helpers — we bind embeddings as `$n::vector` text literals (no extra dep).

export function vecLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/** A NullEmbedder produces an all-zero vector → treat as "no embedding" (store NULL, skip ANN). */
export function isZeroVec(v: number[]): boolean {
  return v.every((x) => x === 0);
}
