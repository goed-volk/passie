#!/usr/bin/env bash
set -euo pipefail

WORKTREE_PATH="${WORKTREE_PATH:-$(pwd)}"
REPO_PATH="${REPO_PATH:-$WORKTREE_PATH}"

echo "==> Setting up Passie in $WORKTREE_PATH (repo: $REPO_PATH)"

# 1. Install dependencies
corepack enable
pnpm install --frozen-lockfile

# 2. Copy private/local files if present in root and missing here
if [ "$WORKTREE_PATH" != "$REPO_PATH" ]; then
  if [ -f "$REPO_PATH/.dev.vars" ] && [ ! -f "$WORKTREE_PATH/.dev.vars" ]; then
    echo "==> Copying .dev.vars from $REPO_PATH"
    cp "$REPO_PATH/.dev.vars" "$WORKTREE_PATH/.dev.vars"
  fi
  if [ -f "$REPO_PATH/seed/group.local.json" ] && [ ! -f "$WORKTREE_PATH/seed/group.local.json" ]; then
    echo "==> Copying seed/group.local.json from $REPO_PATH"
    mkdir -p "$WORKTREE_PATH/seed"
    cp "$REPO_PATH/seed/group.local.json" "$WORKTREE_PATH/seed/group.local.json"
  fi
fi

# 3. Migrate and seed local D1 database
echo "==> Applying local database migrations"
pnpm db:migrate:local

if [ -f "$WORKTREE_PATH/seed/group.local.json" ]; then
  echo "==> Seeding local database with group.local.json"
  pnpm seed:local
else
  echo "==> Seeding local database with group.example.json"
  pnpm seed:example
fi

# 4. Ingest fixtures
echo "==> Ingesting fixtures"
pnpm ingest:local || true

# 5. Generate Cloudflare Worker types
echo "==> Generating Cloudflare types"
pnpm cf-typegen || true

# 6. Summary
PORT="${PASSIE_PORT:-$(( 3000 + $(printf '%s' "$WORKTREE_PATH" | cksum | cut -d' ' -f1) % 900 ))}"
echo "==> Setup complete. Dev server ready at http://localhost:$PORT"
