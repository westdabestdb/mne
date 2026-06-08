// ── Contradiction detection ──────────────────────────────────────────────────────
// Two statements contradict if they can't both be true now. The conservative heuristic here
// flags POLARITY FLIPS on the same subject ("we use X" vs "we no longer use X") — high token
// overlap with opposite negation. It deliberately does NOT guess value-swaps ("use X" vs
// "use Y"), which are ambiguous; an LLM detector can layer on later. Conservative by design:
// a false positive wrongly supersedes a memory, so we only fire on a clear flip.

export interface ContradictionDetector {
  /** True if `incoming` contradicts `existing` (so the older should be superseded). */
  contradicts(incoming: string, existing: string): Promise<boolean>;
}

const STOP = new Set([
  "the","a","an","is","are","was","were","be","to","of","in","on","for","and","or","we","i",
  "our","my","this","that","it","with","as","at","by","from","use","using","used",
]);
const NEG = ["not", "no", "never", "n't", "don't", "dont", "doesn't", "doesnt", "stop", "stopped",
  "drop", "dropped", "remove", "removed", "deprecated", "avoid", "longer"];

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
}
function hasNegation(s: string): boolean {
  const lc = ` ${s.toLowerCase()} `;
  return NEG.some((n) => lc.includes(` ${n} `)) || /n't\b/.test(s.toLowerCase()) || /no longer/.test(s.toLowerCase());
}
function contentTokens(s: string): Set<string> {
  return new Set(tokens(s).filter((t) => !STOP.has(t) && !NEG.includes(t)));
}

export class HeuristicContradictionDetector implements ContradictionDetector {
  async contradicts(incoming: string, existing: string): Promise<boolean> {
    const a = contentTokens(incoming);
    const b = contentTokens(existing);
    if (a.size === 0 || b.size === 0) return false;
    let shared = 0;
    for (const t of a) if (b.has(t)) shared++;
    const overlap = shared / Math.min(a.size, b.size);
    // Same subject (high overlap of content words) but opposite polarity → a flip.
    return overlap >= 0.6 && hasNegation(incoming) !== hasNegation(existing);
  }
}

export class NullContradictionDetector implements ContradictionDetector {
  async contradicts(): Promise<boolean> {
    return false;
  }
}

export function makeContradictionDetector(): ContradictionDetector {
  return (process.env.MNEMIA_CONTRADICTION ?? "heuristic") === "off"
    ? new NullContradictionDetector()
    : new HeuristicContradictionDetector();
}
