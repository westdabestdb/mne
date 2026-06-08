/**
 * Recall brain — the differentiator over a plain vector+FTS store: one ranked, EXPLAINABLE
 * result blending signals (semantic · recency · importance · access · confidence). Deterministic
 * and tunable. (Connectivity is carried but defaults to 0 in the solo build — no graph yet.)
 */

export interface RecallWeights {
  semantic: number;
  recency: number;
  importance: number;
  access: number;
  confidence: number;
}

export const DEFAULT_WEIGHTS: RecallWeights = {
  semantic: 1.0,
  recency: 0.18,
  importance: 0.15,
  access: 0.12,
  confidence: 0.12,
};

export const DEFAULT_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // recency: 7d
export const DEFAULT_IMPORTANCE_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // importance: 30d

/** Reinforcement: saturating curve over recall count. */
export function accessScore(accessCount: number): number {
  return 1 - Math.exp(-Math.max(0, accessCount) / 3);
}

/** Exponential recency decay in [0,1]: age==halfLife → 0.5; new → ~1; old → ~0. */
export function recencyScore(ageMs: number, halfLifeMs: number = DEFAULT_HALF_LIFE_MS): number {
  if (ageMs <= 0) return 1;
  return Math.pow(0.5, ageMs / halfLifeMs);
}

export interface MemorySignals {
  semantic: number; // cosine, clamped to [0,1]
  ageMs: number;
  halfLifeMs?: number;
  importance?: number;
  importanceHalfLifeMs?: number;
  accessCount?: number;
  confidence?: number; // current trust in [0,1]; absent → 1
}

export interface ScoreComponents {
  semantic: number;
  recency: number;
  importance: number;
  access: number;
  confidence: number;
}

export interface ScoreBreakdown {
  score: number;
  components: ScoreComponents;
}

/** Blend signals into a single recall score + transparent breakdown. */
export function recallScore(signals: MemorySignals, weights: RecallWeights = DEFAULT_WEIGHTS): ScoreBreakdown {
  const semantic = clamp01(signals.semantic);
  const recency = recencyScore(signals.ageMs, signals.halfLifeMs);
  const importanceRaw = clamp01(signals.importance ?? 0);
  const importance =
    importanceRaw * recencyScore(signals.ageMs, signals.importanceHalfLifeMs ?? DEFAULT_IMPORTANCE_HALF_LIFE_MS);
  const access = accessScore(signals.accessCount ?? 0);
  const confidence = clamp01(signals.confidence ?? 1);

  const wSum = weights.semantic + weights.recency + weights.importance + weights.access + weights.confidence || 1;
  const score =
    (weights.semantic * semantic +
      weights.recency * recency +
      weights.importance * importance +
      weights.access * access +
      weights.confidence * confidence) /
    wSum;

  return { score, components: { semantic, recency, importance, access, confidence } };
}

/** Human-readable reason a memory ranked where it did (top contributors). */
export function explainRecall(b: ScoreBreakdown, weights: RecallWeights = DEFAULT_WEIGHTS): string {
  const contrib: [string, number][] = [
    ["strong match", weights.semantic * b.components.semantic],
    ["recent", weights.recency * b.components.recency],
    ["important", weights.importance * b.components.importance],
    ["frequently used", weights.access * b.components.access],
    ["well-trusted", weights.confidence * b.components.confidence],
  ];
  const top = contrib
    .filter(([, v]) => v > 0.05)
    .sort((a, b2) => b2[1] - a[1])
    .slice(0, 2)
    .map(([label]) => label);
  return top.length ? top.join(" + ") : "weak signal";
}

/**
 * Candidate-relative semantic normalization. Raw cosine clusters (e.g. 0.6–0.7); stretching the
 * candidate set across [0,1] makes the semantic signal discriminative. Zero-spread → all 1.
 */
export function normalizeSemantic(raw: number[]): number[] {
  if (raw.length === 0) return [];
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  const span = max - min;
  if (span < 1e-9) return raw.map(() => 1);
  return raw.map((v) => (v - min) / span);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
