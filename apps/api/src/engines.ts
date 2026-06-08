import { MemoryEngine, CaptureEngine, makeEmbedder, type Embedder } from "@mnemia/core";

// Lazy singletons — the embedder lazy-loads the MiniLM model on first embed, so we only pay that
// when a memory route is actually hit (auth/project routes never touch it).

let _embedder: Embedder | null = null;
let _memory: MemoryEngine | null = null;
let _capture: CaptureEngine | null = null;

export function embedder(): Embedder {
  return (_embedder ??= makeEmbedder());
}
export function memoryEngine(): MemoryEngine {
  return (_memory ??= new MemoryEngine(embedder()));
}
export function captureEngine(): CaptureEngine {
  return (_capture ??= new CaptureEngine(memoryEngine(), embedder()));
}
