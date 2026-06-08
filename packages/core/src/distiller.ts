import type { DistilledMemory, MemoryType } from "./types.js";

// ── Heuristic distiller ──────────────────────────────────────────────────────────
// Turn raw session text into typed memory candidates WITHOUT an LLM (deterministic, offline).
// Splits into lines/sentences, drops noise, classifies each by keyword cues. An LLM distiller
// can replace this later (same DistilledMemory output) — the engine doesn't care which produced it.

const RULES: { type: MemoryType; importance: number; cues: RegExp }[] = [
  { type: "gotcha", importance: 0.75, cues: /\b(gotcha|careful|watch out|caveat|broke|breaks|fails?|bug|workaround|footgun)\b/i },
  { type: "decision", importance: 0.7, cues: /\b(decided|decision|chose|choosing|going with|we'?ll use|switch(ed)? to|instead of|adopt(ed)?)\b/i },
  { type: "convention", importance: 0.6, cues: /\b(convention|always|never|prefer|style|pattern|rule|standard|must|should)\b/i },
  { type: "open_thread", importance: 0.55, cues: /\b(todo|follow[- ]?up|next step|unresolved|investigate|revisit|open question)\b|\?\s*$/i },
  { type: "reference", importance: 0.45, cues: /\b(see|docs?|reference|link)\b|https?:\/\//i },
];

export class HeuristicDistiller {
  distill(text: string): DistilledMemory[] {
    const out: DistilledMemory[] = [];
    const seen = new Set<string>();
    for (const raw of splitUnits(text)) {
      const line = clean(raw);
      if (line.length < 8) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const rule = RULES.find((r) => r.cues.test(line));
      out.push({ content: line, type: rule?.type ?? "fact", importance: rule?.importance ?? 0.5 });
    }
    return out;
  }
}

function splitUnits(text: string): string[] {
  // Bullets/newlines first; long lines fall back to sentence split.
  const lines = text.split(/\r?\n+/).flatMap((l) => (l.length > 200 ? l.split(/(?<=[.!?])\s+/) : [l]));
  return lines;
}

function clean(s: string): string {
  return s
    .replace(/^\s*[-*•\d.)\]]+\s*/, "") // strip bullet / list markers
    .replace(/^#+\s*/, "") // strip md headers
    .trim();
}
