import { WaitlistForm } from "./components/WaitlistForm";
import { Throughline } from "./components/Throughline";
import { Reveal } from "./components/Reveal";
import { CopyButton } from "./components/CopyButton";

const AGENTS = ["Claude Code", "Codex", "Cursor", "Gemini CLI", "Windsurf", "VS Code"];

const INSTALL_ONELINE = "curl -fsSL https://get.mnemia.dev/install.sh | sh";

const FAILURES = [
  {
    tag: "Forgets",
    head: "Context dies at session end.",
    body: "Every new session is a blank slate. You re-explain the codebase, the decisions, the gotchas. The agent re-asks what you already settled.",
  },
  {
    tag: "Trapped",
    head: "Context is stuck where you learned it.",
    body: "What you figured out lives in one session, on one machine, in one agent. Switch tools, change machines, or hand off to a teammate — and it's all rediscovered the slow way.",
  },
  {
    tag: "Rots",
    head: "Shared memory poisons itself.",
    body: "Bolt a vector store onto a team and it fills with noise: stale facts, two answers that contradict. Wrong memory quietly steers every agent after it.",
  },
];

const STEPS = [
  {
    n: "01 / CAPTURE",
    head: "Distill, don't dump.",
    body: "At session end, Mnemia distills the work into typed memories: decisions, conventions, gotchas, open threads. Or a full checkpoint when every detail matters.",
  },
  {
    n: "02 / RECALL",
    head: "Bring back what matters.",
    body: "In a fresh session, ask. Get ranked context by meaning, recency, importance, and connection. Every result says why it surfaced, and whether it is still fresh.",
  },
  {
    n: "03 / CARRY",
    head: "Everywhere you work.",
    body: "The same memory surfaces in every agent and on every machine you use. Working with others? Promote it to the team in two clicks — reviewed, then live for everyone's agents.",
  },
];

const PILLARS = [
  { name: "Continuity", survives: "survives session end" },
  { name: "Shared brain", survives: "shared across your team" },
  { name: "Correctness", survives: "survives going stale" },
  { name: "Portability", survives: "survives across agents", moat: true },
];

const TOOLS = ["capture", "checkpoint", "recall", "resume", "remember", "share"];

const COMPARE = [
  { them: "CLAUDE.md, built-in memory", gap: "Single user, manual, no ranking or sharing. Locked to one vendor." },
  { them: "Plain MCP memory servers", gap: "Store and dump. No correctness, no scoping, no governance." },
  { them: "Mem0, Zep", gap: "Single-agent recall. No team governance, no staleness checks, no session resume." },
  { them: "Notion, wikis", gap: "Built for humans to read, not agents. Goes stale. Nobody updates it." },
];

const LANES = {
  title: "Built for one. Ready for many.",
  sub: "Same engine, two lives. What saves your 2am session is the same thing that gives a team one mind. Read the column that's you.",
  solo: {
    tag: "01 / SOLO",
    head: "Flying solo",
    points: [
      "The 2am fix is there at 9am — in a different agent, on a different laptop.",
      "Stop re-pasting your architecture into a cold session every morning.",
      "Switch from Claude Code to Cursor mid-thought; your context comes with you.",
    ],
  },
  team: {
    tag: "02 / TEAM",
    head: "Scaling to a team",
    points: [
      "A new hire's agent knows the codebase on day one — no tribal knowledge to hunt down.",
      "Promote a fix once; every teammate's agent reads it after review — no Slack archaeology.",
      "Scopes from personal to team to org; reviewers gate writes, RBAC decides who can.",
    ],
  },
};

const MCP_CONFIG = `{
  "mcpServers": {
    "mnemia": {
      "command": "node",
      "args": ["apps/mcp/dist/index.js"],
      "env": {
        "MNEMIA_MCP_MODE": "proxy",
        "MNEMIA_API_URL": "https://api.mnemia.dev",
        "MNEMIA_API_KEY": "mnem_live_…",
        "MNEMIA_SCOPE": "team"
      }
    }
  }
}`;

const QUICKSTART = [
  { n: "01", head: "One line", body: "Run the installer. It pairs this machine in your browser — no key to copy." },
  { n: "02", head: "Every agent, wired", body: "It detects Claude Code, Cursor, Windsurf, Codex, VS Code, Gemini and writes each one's MCP config + auto-capture hooks. The project is resolved per repo automatically." },
  { n: "03", head: "Capture & recall", body: "End a session — work distills into typed memories. Start a fresh one — recall ranks what matters. On a team? Share in two clicks." },
];

const SIGNUP_CMD = `# pair this machine + install into every agent you have
curl -fsSL https://get.mnemia.dev/install.sh | sh
# opens your browser to approve — then recall/remember work everywhere`;


function Shell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-6 ${className}`}>{children}</div>;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-xs uppercase tracking-[0.22em] text-signal">{children}</span>
  );
}

function CodeBlock({ label, code, lang }: { label: string; code: string; lang: "json" | "sh" }) {
  return (
    <div className="overflow-hidden rounded-xl border border-hair bg-ground">
      <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-raised" />
        <span className="h-2.5 w-2.5 rounded-full bg-raised" />
        <span className="h-2.5 w-2.5 rounded-full bg-raised" />
        <span className="ml-2 font-mono text-xs text-faint">{label}</span>
        <span className="ml-auto">
          <CopyButton value={code} label="Copy" />
        </span>
      </div>
      <pre
        className="overflow-x-auto p-5 font-mono text-[0.8rem] leading-relaxed text-muted"
        dangerouslySetInnerHTML={{ __html: lang === "json" ? highlight(code) : highlightShell(code) }}
      />
    </div>
  );
}

export default function Landing() {
  return (
    <div className="relative overflow-hidden">
      {/* ambient warmth behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[700px]"
        style={{
          background:
            "radial-gradient(60% 60% at 70% 0%, oklch(0.85 0.13 82 / 0.10), transparent 70%)",
        }}
      />

      {/* nav */}
      <nav className="sticky top-0 z-30 border-b border-hair/60 bg-ground/80 backdrop-blur-md">
        <Shell className="flex h-16 items-center justify-between">
          <span className="font-mono text-sm font-medium tracking-[0.18em] text-ink">
            MNEMIA<span className="text-signal">.</span>
          </span>
          <div className="flex items-center gap-7 text-sm text-muted">
            <a href="#who" className="hidden transition hover:text-ink sm:inline">Solo or team</a>
            <a href="#problem" className="hidden transition hover:text-ink sm:inline">The problem</a>
            <a href="#how" className="hidden transition hover:text-ink sm:inline">How it works</a>
            <a href="#install" className="hidden transition hover:text-ink sm:inline">Install</a>
            <a href="/login" className="hidden transition hover:text-ink sm:inline">Sign in</a>
            <a
              href="#waitlist"
              className="rounded-md bg-signal px-4 py-2 font-medium text-ground transition hover:brightness-110"
            >
              Request access
            </a>
          </div>
        </Shell>
      </nav>

      {/* hero */}
      <header className="pb-8 pt-20 md:pt-28">
        <Shell className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="reveal">
            <Kicker>Memory for your AI coding agents</Kicker>
            <h1 className="mt-6 text-[clamp(2.7rem,6.4vw,5.2rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
              One command.
              <br />
              <span className="text-signal">Every agent</span> remembers.
              <br />
              Kept correct.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
              Your agent forgets everything when the session ends. Mnemia is the memory that
              persists — it survives session end, follows you across machines and every agent, and
              stays correct as the code moves. Solo, you stop re-explaining your own codebase. On a
              team, it becomes one shared brain — promoted by review, never by accident.
            </p>

            <div className="mt-8 max-w-xl">
              <div className="flex items-center gap-3 rounded-lg border border-hair bg-ground/70 px-4 py-3 font-mono text-sm">
                <span className="select-none text-faint">$</span>
                <code className="truncate text-ink">{INSTALL_ONELINE}</code>
                <span className="ml-auto shrink-0"><CopyButton value={INSTALL_ONELINE} label="Copy" /></span>
              </div>
              <p className="mt-2 font-mono text-[0.7rem] leading-relaxed text-faint">
                installs into Claude Code · Cursor · Windsurf · Codex · VS Code · Gemini — pairs in your browser, no key to copy.
              </p>
            </div>

            <div className="mt-7" id="waitlist">
              <WaitlistForm />
              <p className="mt-2 font-mono text-[0.7rem] text-faint">hosted access is invite-only while we ramp — request a spot.</p>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-7 gap-y-2 font-mono text-xs text-faint">
              <span><b className="font-medium text-muted">1 command</b> · every agent wired</span>
              <span><b className="font-medium text-muted">6 agents</b> · one memory</span>
              <span><b className="font-medium text-muted">solo free</b> · team on review</span>
            </div>
          </div>

          <div className="reveal" style={{ animationDelay: "140ms" }}>
            <div className="rounded-xl border border-hair/70 bg-panel/40 p-6">
              <div className="flex items-center justify-between font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
                <span>signal · last 7 days</span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal flicker" />
                  live
                </span>
              </div>
              <div className="mt-4">
                <Throughline />
              </div>
              <p className="mt-3 font-mono text-[0.7rem] leading-relaxed text-faint">
                memory threads three moments and never goes dark between them.
              </p>
            </div>
          </div>
        </Shell>
      </header>

      {/* agents readout */}
      <Shell className="py-10">
        <div className="flex flex-col items-baseline gap-4 border-y border-hair/60 py-5 font-mono text-sm sm:flex-row sm:items-center">
          <span className="shrink-0 text-xs uppercase tracking-[0.2em] text-signal">
            one memory ·
          </span>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-muted">
            {AGENTS.map((a) => (
              <span key={a}>{a}</span>
            ))}
          </div>
        </div>
      </Shell>

      {/* solo | team lanes */}
      <section id="who" className="border-y border-hair/60 bg-panel/30 py-24">
        <Shell>
          <Reveal className="max-w-2xl">
            <Kicker>Solo or team</Kicker>
            <h2 className="mt-5 text-[clamp(2rem,4.4vw,3.2rem)] font-bold tracking-[-0.02em]">{LANES.title}</h2>
            <p className="mt-5 text-lg text-muted">{LANES.sub}</p>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-2">
            {[LANES.solo, LANES.team].map((lane, i) => (
              <Reveal as="article" key={lane.head} delay={i * 110} className="rounded-xl border border-hair bg-ground/50 p-7">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-signal">{lane.tag}</span>
                <h3 className="mt-3 text-2xl font-semibold">{lane.head}</h3>
                <ul className="mt-5 space-y-3">
                  {lane.points.map((p) => (
                    <li key={p} className="flex gap-3 text-muted">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                      <span className="leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </Shell>
      </section>

      {/* problem */}
      <section id="problem" className="py-24">
        <Shell>
          <Reveal className="max-w-2xl">
            <Kicker>Why agent memory fails</Kicker>
            <h2 className="mt-5 text-[clamp(2rem,4.4vw,3.2rem)] font-bold tracking-[-0.02em]">
              Agent memory rots in days.
            </h2>
            <p className="mt-5 text-lg text-muted">
              Three silent failures poison every answer that follows.
            </p>
          </Reveal>

          <div className="mt-14 border-t border-hair">
            {FAILURES.map((f, i) => (
              <Reveal
                key={f.tag}
                delay={i * 90}
                className="grid gap-4 border-b border-hair py-8 md:grid-cols-[200px_1fr] md:gap-12"
              >
                <span className="font-mono text-sm uppercase tracking-[0.16em] text-signal-dim">
                  {f.tag}
                </span>
                <div className="max-w-2xl">
                  <h3 className="text-xl font-semibold">{f.head}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Shell>
      </section>

      {/* how it works */}
      <section id="how" className="border-y border-hair/60 bg-panel/30 py-24">
        <Shell>
          <Reveal className="max-w-2xl">
            <Kicker>How it works</Kicker>
            <h2 className="mt-5 text-[clamp(2rem,4.4vw,3.2rem)] font-bold tracking-[-0.02em]">
              Capture. Recall. Carry.
            </h2>
            <p className="mt-5 text-lg text-muted">
              Three moves, all from inside the agent you already use.
            </p>
          </Reveal>

          <div className="relative mt-16">
            {/* the throughline reprised behind the steps */}
            <div
              aria-hidden
              className="absolute left-0 right-0 top-[7px] hidden h-px bg-gradient-to-r from-transparent via-hair to-transparent md:block"
            />
            <div className="grid gap-12 md:grid-cols-3 md:gap-10">
              {STEPS.map((s, i) => (
                <Reveal as="article" key={s.n} delay={i * 120}>
                  <span
                    className="block h-3.5 w-3.5 rounded-full bg-signal"
                    style={{ boxShadow: "0 0 16px oklch(0.85 0.13 82 / 0.6)" }}
                  />
                  <span className="mt-6 block font-mono text-xs tracking-[0.16em] text-faint">
                    {s.n}
                  </span>
                  <h3 className="mt-3 text-xl font-semibold">{s.head}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{s.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </Shell>
      </section>

      {/* compare */}
      <section className="py-24">
        <Shell className="max-w-4xl">
          <Reveal>
            <p className="text-[clamp(1.4rem,3vw,2.1rem)] font-medium leading-snug text-muted">
              Other memory layers help one agent remember more.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-4 text-[clamp(1.4rem,3vw,2.1rem)] font-semibold leading-snug">
              Mnemia keeps your memory{" "}
              <span className="text-signal">true</span> — for you, and across your team — and carries it to any agent.
            </p>
          </Reveal>

          <div className="mt-14 border-t border-hair">
            {COMPARE.map((c, i) => (
              <Reveal
                key={c.them}
                delay={i * 70}
                className="grid gap-2 border-b border-hair py-5 md:grid-cols-[1fr_1.7fr] md:gap-10"
              >
                <span className="font-mono text-sm text-faint">{c.them}</span>
                <span className="text-muted">{c.gap}</span>
              </Reveal>
            ))}
          </div>
        </Shell>
      </section>

      {/* connect / code */}
      <section id="connect" className="border-y border-hair/60 bg-panel/30 py-24">
        <Shell className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <Kicker>Connect in a minute</Kicker>
            <h2 className="mt-5 text-[clamp(1.9rem,4vw,3rem)] font-bold tracking-[-0.02em]">
              One brain, every agent.
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
              One command installs Mnemia into every agent on your machine and pairs in your
              browser. Your context follows you across sessions, machines, and tools — and your
              teammates too, once you share. The project follows each repo, automatically.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {TOOLS.map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-hair bg-ground px-3 py-1.5 font-mono text-xs text-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="overflow-hidden rounded-xl border border-hair bg-ground">
              <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-raised" />
                <span className="h-2.5 w-2.5 rounded-full bg-raised" />
                <span className="h-2.5 w-2.5 rounded-full bg-raised" />
                <span className="ml-2 font-mono text-xs text-faint">.mcp.json</span>
                <span className="ml-auto">
                  <CopyButton value={MCP_CONFIG} label="Copy MCP config" />
                </span>
              </div>
              <pre
                className="overflow-x-auto p-5 font-mono text-[0.82rem] leading-relaxed text-muted"
                dangerouslySetInnerHTML={{ __html: highlight(MCP_CONFIG) }}
              />
            </div>
          </Reveal>
        </Shell>
      </section>

      {/* install */}
      <section id="install" className="py-24">
        <Shell>
          <Reveal className="max-w-2xl">
            <Kicker>Install</Kicker>
            <h2 className="mt-5 text-[clamp(2rem,4.4vw,3.2rem)] font-bold tracking-[-0.02em]">
              Running in 60 seconds.
            </h2>
            <p className="mt-5 text-lg text-muted">
              Pair this machine once and Mnemia installs into every agent you have. One line.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-8 md:grid-cols-3 md:gap-10">
            {QUICKSTART.map((s, i) => (
              <Reveal as="article" key={s.n} delay={i * 100}>
                <span className="font-mono text-xs tracking-[0.16em] text-faint">{s.n}</span>
                <h3 className="mt-3 text-xl font-semibold">{s.head}</h3>
                <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
              </Reveal>
            ))}
          </div>

          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            <Reveal>
              <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-signal">
                One line · installs every agent
              </p>
              <CodeBlock label="terminal" code={SIGNUP_CMD} lang="sh" />
            </Reveal>

            <Reveal delay={120}>
              <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-signal">
                or wire one agent by hand · .mcp.json
              </p>
              <CodeBlock label=".mcp.json" code={MCP_CONFIG} lang="json" />
            </Reveal>
          </div>

          <Reveal delay={160}>
            <p className="mt-10 font-mono text-sm text-faint">
              Then just talk to your agent: <span className="text-muted">“recall what we decided about auth”</span>,
              <span className="text-muted"> “remember this gotcha”</span>. Capture runs at session end.
            </p>
          </Reveal>
        </Shell>
      </section>

      {/* pillars band */}
      <section className="py-24">
        <Shell>
          <Reveal className="max-w-2xl">
            <Kicker>What survives</Kicker>
            <h2 className="mt-5 text-[clamp(2rem,4.4vw,3.2rem)] font-bold tracking-[-0.02em]">
              Memory that lasts, four ways.
            </h2>
            <p className="mt-5 text-muted">
              <b className="font-medium text-ink">Solo:</b> your context survives session end, follows you across machines
              and agents, and never quietly goes stale on you. <b className="font-medium text-ink">Team:</b> the same four
              add a governed shared brain — reviewed writes, scoped access, consensus that keeps it trustworthy at headcount.
            </p>
          </Reveal>
          <div className="mt-12 border-t border-hair">
            {PILLARS.map((p, i) => (
              <Reveal
                key={p.name}
                delay={i * 70}
                className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-hair py-6 transition hover:bg-panel/40"
              >
                <span className="w-10 font-mono text-sm text-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-xl font-semibold">{p.name}</span>
                <span className="font-mono text-sm text-signal">{p.survives}</span>
                {p.moat && (
                  <span className="ml-auto rounded-full border border-signal/40 px-3 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-signal">
                    primary moat
                  </span>
                )}
              </Reveal>
            ))}
          </div>
        </Shell>
      </section>

      {/* final CTA */}
      <section className="relative overflow-hidden border-t border-hair/60 py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50% 80% at 50% 120%, oklch(0.85 0.13 82 / 0.16), transparent 70%)",
          }}
        />
        <Shell className="text-center">
          <Reveal>
            <h2 className="mx-auto max-w-2xl text-[clamp(2rem,4.6vw,3.4rem)] font-bold tracking-[-0.02em]">
              Run one line. Never re-explain your codebase again.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
              Free for the solo dev who&apos;s tired of starting cold every morning. Built to grow into the
              shared brain your team flips on — reviewed and scoped — when you&apos;re ready. Same install, either way.
            </p>
            <div className="mt-9 flex justify-center">
              <WaitlistForm />
            </div>
          </Reveal>
        </Shell>
      </section>

      {/* footer */}
      <footer className="border-t border-hair/60 py-10">
        <Shell className="flex flex-col items-center justify-between gap-5 sm:flex-row">
          <span className="font-mono text-sm tracking-[0.18em] text-ink">
            MNEMIA<span className="text-signal">.</span>
          </span>
          <div className="flex gap-6 text-sm text-muted">
            <a href="#problem" className="transition hover:text-ink">Problem</a>
            <a href="#how" className="transition hover:text-ink">How it works</a>
            <a href="#install" className="transition hover:text-ink">Install</a>
            <a href="/login" className="transition hover:text-ink">Sign in</a>
          </div>
          <span className="font-mono text-xs text-faint">
memory for your AI coding agents — solo or team
          </span>
        </Shell>
      </footer>
    </div>
  );
}

// minimal JSON highlighter for the static config block
function highlight(src: string): string {
  return src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"(\w[\w-]*)":/g, '<span style="color:var(--color-ink)">"$1"</span>:')
    .replace(/: ("(?:[^"\\]|\\.)*"|…)/g, ': <span style="color:var(--color-signal)">$1</span>');
}

// minimal shell highlighter: comments faint, leading command word signal-colored
function highlightShell(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const esc = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      if (esc.trim().startsWith("#")) return `<span style="color:var(--color-faint)">${esc}</span>`;
      return esc.replace(/^(\s*)([a-z][\w.-]*)/, '$1<span style="color:var(--color-signal)">$2</span>');
    })
    .join("\n");
}
