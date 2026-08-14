#!/usr/bin/env bash
set -euo pipefail

WORKTREE_PATH="${WORKTREE_PATH:-$(pwd)}"
PORT="${PASSIE_PORT:-$(( 3000 + $(printf '%s' "$WORKTREE_PATH" | cksum | cut -d' ' -f1) % 900 ))}"

if [ "${1:-}" = "stop" ]; then
  echo "Stopping dev server on port $PORT..."
  PID=$(lsof -ti :"$PORT" || true)
  if [ -n "$PID" ]; then
    kill "$PID" || true
  fi
  exit 0
fi

echo "Passie dev server: http://localhost:$PORT"

if [ "${PASSIE_PREVIEW:-0}" = "1" ]; then
  echo "Starting OpenNext Cloudflare workerd preview on port $PORT"
  exec pnpm preview --port "$PORT"
else
  exec pnpm next dev --port "$PORT" --hostname 127.0.0.1
fi
