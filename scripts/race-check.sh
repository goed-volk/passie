#!/usr/bin/env bash
set -euo pipefail

PORT="${PASSIE_PORT:-3111}"
BASE_URL="http://127.0.0.1:$PORT"
POOL_ID="pool_group_goedvolk_fix_test_1"

echo "==> Running Passie deterministic race-check on $BASE_URL for pool $POOL_ID"

for iteration in {1..5}; do
  echo "--- Iteration $iteration / 5 ---"

  # 1. Reset and prepare test database
  pnpm tsx scripts/setup-test-pool.ts > /dev/null

  # 2. Fire concurrent requests using curl and record HTTP response codes
  RESP_DIR=$(mktemp -d)

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_daan" \
    -H "Idempotency-Key: test-join-daan-$RANDOM" \
    -d '{"kind":"self"}' -o /dev/null > "$RESP_DIR/join_daan.code" &
  PID1=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_eva" \
    -H "Idempotency-Key: test-join-eva-$RANDOM" \
    -d '{"kind":"self"}' -o /dev/null > "$RESP_DIR/join_eva.code" &
  PID2=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/pass/pass_goedvolk_1/indicate" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_sam" \
    -H "Idempotency-Key: test-rel-sam-$RANDOM" \
    -d '{"action":"release"}' -o /dev/null > "$RESP_DIR/rel_sam.code" &
  PID3=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/pass/pass_goedvolk_3/indicate" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_bram" \
    -H "Idempotency-Key: test-rel-bram-$RANDOM" \
    -d '{"action":"release"}' -o /dev/null > "$RESP_DIR/rel_bram.code" &
  PID4=$!

  wait $PID1 $PID2 $PID3 $PID4

  CODE1=$(cat "$RESP_DIR/join_daan.code")
  CODE2=$(cat "$RESP_DIR/join_eva.code")
  CODE3=$(cat "$RESP_DIR/rel_sam.code")
  CODE4=$(cat "$RESP_DIR/rel_bram.code")
  rm -rf "$RESP_DIR"

  if [ "$CODE1" -ne 200 ] || [ "$CODE2" -ne 200 ] || [ "$CODE3" -ne 200 ] || [ "$CODE4" -ne 200 ]; then
    echo "❌ One or more concurrent requests failed: daan=$CODE1, eva=$CODE2, sam=$CODE3, bram=$CODE4"
    exit 1
  fi

  # 3. Inspect state via inspect-race-state script
  STATE_OUTPUT=$(pnpm tsx scripts/inspect-race-state.ts "$POOL_ID")
  STATE_JSON=$(echo "$STATE_OUTPUT" | sed -n 's/.*__STATE_START__\(.*\)__STATE_END__.*/\1/p')

  # Parse state using node
  INSPECT_RESULT=$(node -e '
    const state = JSON.parse(process.argv[1]);
    const assignedPasses = state.passStates.filter(p => p.status === "assigned");
    const assignedEntries = state.queue.filter(q => q.status === "assigned");
    const waitingEntries = state.queue.filter(q => q.status === "waiting");
    const unassignedReleased = state.passStates.filter(p => p.status === "released" && p.claimantEntryId === null);

    if (assignedPasses.length !== 2 || assignedEntries.length !== 2 || waitingEntries.length !== 0 || unassignedReleased.length !== 0) {
      console.error("Invariant failure: assignedPasses=" + assignedPasses.length + ", assignedEntries=" + assignedEntries.length + ", waiting=" + waitingEntries.length + ", unassignedReleased=" + unassignedReleased.length);
      process.exit(1);
    }

    // Assert valid assignments: every assigned entry points to a valid pass and vice-versa
    for (const q of state.queue) {
      if (q.status === "assigned") {
        const matchingPass = state.passStates.find(p => p.passId === q.assignedPassId);
        if (!matchingPass || matchingPass.claimantEntryId !== q.id || matchingPass.status !== "assigned") {
          console.error("Mismatched pass assignment for entry: " + JSON.stringify(q));
          process.exit(1);
        }
      }
    }

    // Invariant 5: Version matches number of mutations (4 mutations + initial version 0 = 4)
    if (state.version !== 4) {
      console.error("Version undercount: expected 4, got " + state.version);
      process.exit(1);
    }

    // Invariant 6: Activity events count and idempotency key discipline
    const assignedEvents = state.events.filter(e => e.type === "pass.assigned");
    if (assignedEvents.length !== 2) {
      console.error("Expected 2 pass.assigned events, got " + assignedEvents.length);
      process.exit(1);
    }
    for (const evt of assignedEvents) {
      if (evt.idempotencyKey !== null) {
        console.error("Cascading pass.assigned event has non-null idempotencyKey: " + JSON.stringify(evt));
        process.exit(1);
      }
    }

    console.log("OK: 2 passes assigned, 2 entries assigned, 0 waiting, version=" + state.version);
  ' "$STATE_JSON")

  echo "==> $INSPECT_RESULT"
done

echo "✅ All 5 race-check iterations passed deterministically!"
