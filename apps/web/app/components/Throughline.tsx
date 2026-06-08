// The "throughline": a continuous signal that draws itself on load.
// Nodes mark where memory is captured, recalled, and shared. The line
// never goes dark between them — that persistence is the whole product.

const NODES = [
  { x: 200, y: 60, label: "capture" },
  { x: 560, y: 90, label: "recall" },
  { x: 980, y: 40, label: "share" },
];

const PATH =
  "M0,140 C80,140 120,60 200,60 C280,60 300,150 380,150 C460,150 470,90 560,90 " +
  "C650,90 660,140 760,140 C860,140 870,40 980,40 C1080,40 1110,120 1200,120";

export function Throughline() {
  return (
    <svg
      viewBox="0 0 1200 200"
      fill="none"
      role="img"
      aria-label="A continuous signal threading three points: capture, recall, share."
      className="h-auto w-full overflow-visible"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="signalFade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--color-signal)" stopOpacity="0.15" />
          <stop offset="0.18" stopColor="var(--color-signal)" stopOpacity="1" />
          <stop offset="0.92" stopColor="var(--color-signal)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--color-signal)" stopOpacity="0.15" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* faint baseline — where context would flatline without memory */}
      <line
        x1="0"
        y1="140"
        x2="1200"
        y2="140"
        stroke="var(--color-hair)"
        strokeWidth="1"
        strokeDasharray="2 7"
      />

      {/* the living signal */}
      <path
        d={PATH}
        pathLength={1}
        stroke="url(#signalFade)"
        strokeWidth="2.5"
        strokeLinecap="round"
        filter="url(#glow)"
        className="draw"
      />

      {NODES.map((n) => (
        <g key={n.label}>
          <circle cx={n.x} cy={n.y} r="9" fill="var(--color-signal)" opacity="0.16" className="flicker" />
          <circle cx={n.x} cy={n.y} r="3.5" fill="var(--color-signal)" />
          <text
            x={n.x}
            y={n.y - 20}
            textAnchor="middle"
            className="font-mono"
            fill="var(--color-muted)"
            fontSize="13"
            letterSpacing="1.5"
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
