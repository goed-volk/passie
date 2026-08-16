#!/usr/bin/env bash
set -euo pipefail

PORT="${PASSIE_PORT:-3111}"
BASE_URL="http://127.0.0.1:$PORT"
POOL_ID="pool_group_goedvolk_fix_test_1"

echo "==> Running Passie race-check on $BASE_URL for pool $POOL_ID"

# 1. Reset and prepare test database
echo "==> Resetting database and seeding test pool"
pnpm tsx scripts/setup-test-pool.ts

# 2. Fire concurrent requests using curl
echo "==> Firing 2 concurrent queue joins (daan & eva) and 2 concurrent pass releases (sam & bram)..."

# Join queue: daan (member_goedvolk_daan) and eva (member_goedvolk_eva)
curl -s -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
  -H "Content-Type: application/json" \
  -H "Cookie: passie_member=member_goedvolk_daan" \
  -H "Idempotency-Key: test-join-daan-$RANDOM" \
  -d '{"kind":"self"}' > /dev/null &
PID1=$!

curl -s -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
  -H "Content-Type: application/json" \
  -H "Cookie: passie_member=member_goedvolk_eva" \
  -H "Idempotency-Key: test-join-eva-$RANDOM" \
  -d '{"kind":"self"}' > /dev/null &
PID2=$!

# Release pass: sam releases pass 1, bram releases pass 3
curl -s -X POST "$BASE_URL/api/pool/$POOL_ID/pass/pass_goedvolk_1/indicate" \
  -H "Content-Type: application/json" \
  -H "Cookie: passie_member=member_goedvolk_sam" \
  -H "Idempotency-Key: test-rel-sam-$RANDOM" \
  -d '{"action":"release"}' > /dev/null &
PID3=$!

curl -s -X POST "$BASE_URL/api/pool/$POOL_ID/pass/pass_goedvolk_3/indicate" \
  -H "Content-Type: application/json" \
  -H "Cookie: passie_member=member_goedvolk_bram" \
  -H "Idempotency-Key: test-rel-bram-$RANDOM" \
  -d '{"action":"release"}' > /dev/null &
PID4=$!

wait $PID1 $PID2 $PID3 $PID4

echo "==> Concurrent operations completed. Inspecting local D1 database state..."

# 3. Assert invariants via wrangler d1
ASSIGNED_PASSES=$(npx wrangler d1 execute passie --local --command "SELECT count(*) as count FROM pass_game_states WHERE game_pool_id='$POOL_ID' AND status='assigned';" | grep -o '"count": *[0-9]*' | head -n1 | cut -d':' -f2 | tr -d ' ')
ASSIGNED_ENTRIES=$(npx wrangler d1 execute passie --local --command "SELECT count(*) as count FROM queue_entries WHERE game_pool_id='$POOL_ID' AND status='assigned';" | grep -o '"count": *[0-9]*' | head -n1 | cut -d':' -f2 | tr -d ' ')
WAITING_ENTRIES=$(npx wrangler d1 execute passie --local --command "SELECT count(*) as count FROM queue_entries WHERE game_pool_id='$POOL_ID' AND status='waiting';" | grep -o '"count": *[0-9]*' | head -n1 | cut -d':' -f2 | tr -d ' ')

echo "==> Assigned passes: $ASSIGNED_PASSES, Assigned queue entries: $ASSIGNED_ENTRIES, Waiting entries: $WAITING_ENTRIES"

if [ "$ASSIGNED_PASSES" -ne 2 ] || [ "$ASSIGNED_ENTRIES" -ne 2 ] || [ "$WAITING_ENTRIES" -ne 0 ]; then
  echo "❌ Concurrency invariant failed: 2 passes released and 2 queue requests must result in exactly 2 assigned passes and 0 waiting entries."
  exit 1
fi

echo "✅ Concurrency race check passed successfully!"
