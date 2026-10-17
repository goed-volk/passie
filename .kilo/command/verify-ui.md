---
description: "Start dev server and run race check plus browser UI verification"
---
Start the dev server on port 3111 and run race checks:
```bash
PASSIE_PORT=3111 .kilo/run-script.sh &
bash scripts/race-check.sh
```
Walk through golden-path UI with Browser Use:
1. Navigate to `http://localhost:3111/inloggen` (or authenticate in dev via `POST /api/dev/login-as` with `{"memberSlug": "sam"}` when `PASSIE_DEV_LOGIN=1`).
2. Indicate a pass (Keep or Release).
3. Switch member in dev by signing in as another member (e.g. `daan`).
4. Join the queue and verify assignment.
5. Confirm physical handover.
6. Verify `/pas/[id]` and timeline update.
