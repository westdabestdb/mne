#!/usr/bin/env bash
# Mnemia installer — places the CLI + MCP bundles and wires every detected coding agent.
#
#   Dev (from a repo clone):   bash scripts/install/install.sh
#   (A hosted `curl … | sh` path that downloads prebuilt bundles lands later.)
#
# After this finishes you run ONE command — `mnemia auth` — and approve in the browser.
# Nothing else to configure by hand.
set -euo pipefail

MNEMIA_HOME="${MNEMIA_HOME:-$HOME/.mnemia}"
BIN="$MNEMIA_HOME/bin"
API_URL="${MNEMIA_API_URL:-http://localhost:8787}"

say() { printf '\033[1;33mmnemia\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mmnemia\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "node is required (>=20). Install Node and re-run."

# Locate the repo root (this script lives at <repo>/scripts/install/install.sh).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

MCP_BUNDLE="$REPO_ROOT/apps/mcp/bundle/mnemia-mcp.cjs"
CLI_BUNDLE="$REPO_ROOT/apps/cli/bundle/mnemia.cjs"

# Build bundles from the repo if they're missing (dev install path).
if [ ! -f "$MCP_BUNDLE" ] || [ ! -f "$CLI_BUNDLE" ]; then
  command -v pnpm >/dev/null 2>&1 || die "pnpm is required to build from source. Run: npm i -g pnpm"
  say "building bundles…"
  ( cd "$REPO_ROOT" && pnpm install --silent && pnpm --filter @mnemia/mcp bundle && pnpm --filter @mnemia/cli bundle )
fi
[ -f "$MCP_BUNDLE" ] || die "MCP bundle not found at $MCP_BUNDLE"
[ -f "$CLI_BUNDLE" ] || die "CLI bundle not found at $CLI_BUNDLE"

say "installing to $BIN"
mkdir -p "$BIN"
cp "$MCP_BUNDLE" "$BIN/mnemia-mcp.cjs"
cp "$CLI_BUNDLE" "$BIN/mnemia.cjs"

# A tiny launcher so `mnemia` is on PATH (node runs the bundle).
cat > "$BIN/mnemia" <<EOF
#!/bin/sh
exec node "$BIN/mnemia.cjs" "\$@"
EOF
chmod +x "$BIN/mnemia"

# Put the launcher somewhere on PATH.
LINKED=""
for d in "/usr/local/bin" "$HOME/.local/bin"; do
  if [ -d "$d" ] && [ -w "$d" ]; then
    ln -sf "$BIN/mnemia" "$d/mnemia" && LINKED="$d/mnemia" && break
  fi
done
if [ -z "$LINKED" ]; then
  mkdir -p "$HOME/.local/bin" && ln -sf "$BIN/mnemia" "$HOME/.local/bin/mnemia" && LINKED="$HOME/.local/bin/mnemia"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) say "add \$HOME/.local/bin to your PATH:  export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
  esac
fi

# Wire every detected agent (writes MNEMIA_API_URL only — the key comes from `mnemia auth`).
say "detecting agents and writing MCP config…"
MNEMIA_API_URL="$API_URL" node "$BIN/mnemia.cjs" install

printf '\n'
say "installed. Now run:  \033[1mmnemia auth\033[0m"
