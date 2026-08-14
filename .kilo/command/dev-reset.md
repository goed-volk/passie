---
description: "Reset local D1, re-migrate, re-seed, and re-ingest fixtures"
---
Reset local database and environment:
```bash
rm -rf .wrangler/state/v3/d1
pnpm db:migrate:local
if [ -f seed/group.local.json ]; then
  pnpm seed:local
else
  pnpm seed:example
fi
pnpm ingest:local || true
```
