#!/usr/bin/env bash
set -euo pipefail

PORT="${PASSIE_PORT:-3111}"
BASE_URL="http://127.0.0.1:$PORT"
POOL_ID="pool_group_goedvolk_fix_test_1"
ITERATIONS="${RACE_CHECK_ITERATIONS:-${1:-5}}"

cleanup() {
  pnpm tsx scripts/cleanup-test-pool.ts > /dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Checking dev server health on $BASE_URL..."
if ! curl -s -f "$BASE_URL/api/me" > /dev/null 2>&1; then
  # Try checking root if /api/me returns 200 or 401
  HTTP_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/me" || echo "000")
  if [ "$HTTP_CHECK" = "000" ]; then
    echo "❌ Dev server not reachable on $BASE_URL."
    echo "Please start the dev server first: PASSIE_PORT=$PORT .kilo/run-script.sh"
    exit 1
  fi
fi
echo "==> Dev server is healthy."

echo "==> Running Passie multi-scenario deterministic race-check on $BASE_URL for pool $POOL_ID ($ITERATIONS iterations)"

for ((iteration=1; iteration<=ITERATIONS; iteration++)); do
  echo "========================================="
  echo ">>> Iteration $iteration / $ITERATIONS"
  echo "========================================="

  # --------------------------------------------------------------------------
  # Scenario 1: Balanced Contention (2 Joins + 2 Releases)
  # --------------------------------------------------------------------------
  echo "--- [Scenario 1] Balanced Contention (2 Joins + 2 Releases) ---"
  pnpm tsx scripts/setup-test-pool.ts default > /dev/null

  RESP_DIR=$(mktemp -d)
  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_daan" \
    -H "Idempotency-Key: s1-join-daan-$iteration-$RANDOM" \
    -d '{"kind":"self"}' -o "$RESP_DIR/join_daan.body" > "$RESP_DIR/join_daan.code" &
  PID1=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_eva" \
    -H "Idempotency-Key: s1-join-eva-$iteration-$RANDOM" \
    -d '{"kind":"self"}' -o "$RESP_DIR/join_eva.body" > "$RESP_DIR/join_eva.code" &
  PID2=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/pass/pass_goedvolk_1/indicate" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_sam" \
    -H "Idempotency-Key: s1-rel-sam-$iteration-$RANDOM" \
    -d '{"action":"release"}' -o "$RESP_DIR/rel_sam.body" > "$RESP_DIR/rel_sam.code" &
  PID3=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/pass/pass_goedvolk_3/indicate" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_bram" \
    -H "Idempotency-Key: s1-rel-bram-$iteration-$RANDOM" \
    -d '{"action":"release"}' -o "$RESP_DIR/rel_bram.body" > "$RESP_DIR/rel_bram.code" &
  PID4=$!

  wait $PID1 $PID2 $PID3 $PID4

  CODE1=$(cat "$RESP_DIR/join_daan.code")
  CODE2=$(cat "$RESP_DIR/join_eva.code")
  CODE3=$(cat "$RESP_DIR/rel_sam.code")
  CODE4=$(cat "$RESP_DIR/rel_bram.code")

  if [ "$CODE1" -ne 200 ] || [ "$CODE2" -ne 200 ] || [ "$CODE3" -ne 200 ] || [ "$CODE4" -ne 200 ]; then
    echo "❌ Scenario 1 request failed: daan=$CODE1, eva=$CODE2, sam=$CODE3, bram=$CODE4"
    echo "Daan body: $(cat "$RESP_DIR/join_daan.body")"
    echo "Eva body: $(cat "$RESP_DIR/join_eva.body")"
    echo "Sam body: $(cat "$RESP_DIR/rel_sam.body")"
    echo "Bram body: $(cat "$RESP_DIR/rel_bram.body")"
    rm -rf "$RESP_DIR"
    exit 1
  fi
  rm -rf "$RESP_DIR"

  STATE_OUTPUT=$(pnpm tsx scripts/inspect-race-state.ts "$POOL_ID")
  STATE_JSON=$(echo "$STATE_OUTPUT" | sed -n 's/.*__STATE_START__\(.*\)__STATE_END__.*/\1/p')

  node -e '
    const state = JSON.parse(process.argv[1]);
    const assignedPasses = state.passStates.filter(p => p.status === "assigned");
    const assignedEntries = state.queue.filter(q => q.status === "assigned");
    const waitingEntries = state.queue.filter(q => q.status === "waiting");
    const unassignedReleased = state.passStates.filter(p => p.status === "released" && p.claimantEntryId === null);

    if (assignedPasses.length !== 2 || assignedEntries.length !== 2 || waitingEntries.length !== 0 || unassignedReleased.length !== 0) {
      console.error("Invariant failure: assignedPasses=" + assignedPasses.length + ", assignedEntries=" + assignedEntries.length + ", waiting=" + waitingEntries.length + ", unassignedReleased=" + unassignedReleased.length);
      process.exit(1);
    }

    // Assert that exactly pass_goedvolk_1 and pass_goedvolk_3 are assigned
    const assignedPassIds = assignedPasses.map(p => p.passId).sort();
    const expectedPassIds = ["pass_goedvolk_1", "pass_goedvolk_3"].sort();
    if (JSON.stringify(assignedPassIds) !== JSON.stringify(expectedPassIds)) {
      console.error("Assigned passes mismatch: expected " + JSON.stringify(expectedPassIds) + ", got " + JSON.stringify(assignedPassIds));
      process.exit(1);
    }

    // Assert consistent 1-to-1 bidirectional pairing between queue entries and passes
    for (const q of assignedEntries) {
      const matchingPass = assignedPasses.find(p => p.passId === q.assignedPassId);
      if (!matchingPass || matchingPass.claimantEntryId !== q.id) {
        console.error("Mismatched entry pairing: " + JSON.stringify(q) + " vs " + JSON.stringify(matchingPass));
        process.exit(1);
      }
    }

    if (state.version !== 4) {
      console.error("Version failure: expected 4, got " + state.version);
      process.exit(1);
    }

    const expectedGuards = [0, 1, 2, 3, 4];
    if (JSON.stringify(state.guardVersions) !== JSON.stringify(expectedGuards)) {
      console.error("Guards failure: expected " + JSON.stringify(expectedGuards) + ", got " + JSON.stringify(state.guardVersions));
      process.exit(1);
    }

    const assignedEvents = state.events.filter(e => e.type === "pass.assigned");
    if (assignedEvents.length !== 2) {
      console.error("Expected 2 pass.assigned events, got " + assignedEvents.length);
      process.exit(1);
    }
    for (const evt of assignedEvents) {
      if (evt.idempotencyKey !== null) {
        console.error("Cascading pass.assigned has non-null idempotencyKey: " + JSON.stringify(evt));
        process.exit(1);
      }
    }
    console.log("  ✓ Scenario 1 passed (2 assigned, pairing verified, version=4)");
  ' "$STATE_JSON"

  # --------------------------------------------------------------------------
  # Scenario 2: Over-Subscribed Contention (3 Joins + 1 Release)
  # --------------------------------------------------------------------------
  echo "--- [Scenario 2] Over-Subscribed Contention (3 Joins + 1 Release) ---"
  pnpm tsx scripts/setup-test-pool.ts default > /dev/null

  RESP_DIR=$(mktemp -d)
  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_daan" \
    -H "Idempotency-Key: s2-join-daan-$iteration-$RANDOM" \
    -d '{"kind":"self"}' -o "$RESP_DIR/join_daan.body" > "$RESP_DIR/join_daan.code" &
  PID1=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_eva" \
    -H "Idempotency-Key: s2-join-eva-$iteration-$RANDOM" \
    -d '{"kind":"self"}' -o "$RESP_DIR/join_eva.body" > "$RESP_DIR/join_eva.code" &
  PID2=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_noor" \
    -H "Idempotency-Key: s2-join-noor-$iteration-$RANDOM" \
    -d '{"kind":"self"}' -o "$RESP_DIR/join_noor.body" > "$RESP_DIR/join_noor.code" &
  PID3=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/pass/pass_goedvolk_1/indicate" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_sam" \
    -H "Idempotency-Key: s2-rel-sam-$iteration-$RANDOM" \
    -d '{"action":"release"}' -o "$RESP_DIR/rel_sam.body" > "$RESP_DIR/rel_sam.code" &
  PID4=$!

  wait $PID1 $PID2 $PID3 $PID4

  CODE1=$(cat "$RESP_DIR/join_daan.code")
  CODE2=$(cat "$RESP_DIR/join_eva.code")
  CODE3=$(cat "$RESP_DIR/join_noor.code")
  CODE4=$(cat "$RESP_DIR/rel_sam.code")

  if [ "$CODE1" -ne 200 ] || [ "$CODE2" -ne 200 ] || [ "$CODE3" -ne 200 ] || [ "$CODE4" -ne 200 ]; then
    echo "❌ Scenario 2 request failed: daan=$CODE1, eva=$CODE2, noor=$CODE3, sam=$CODE4"
    echo "Daan body: $(cat "$RESP_DIR/join_daan.body")"
    echo "Eva body: $(cat "$RESP_DIR/join_eva.body")"
    echo "Noor body: $(cat "$RESP_DIR/join_noor.body")"
    echo "Sam body: $(cat "$RESP_DIR/rel_sam.body")"
    rm -rf "$RESP_DIR"
    exit 1
  fi
  rm -rf "$RESP_DIR"

  STATE_OUTPUT=$(pnpm tsx scripts/inspect-race-state.ts "$POOL_ID")
  STATE_JSON=$(echo "$STATE_OUTPUT" | sed -n 's/.*__STATE_START__\(.*\)__STATE_END__.*/\1/p')

  node -e '
    const state = JSON.parse(process.argv[1]);
    const assignedPasses = state.passStates.filter(p => p.status === "assigned");
    const assignedEntries = state.queue.filter(q => q.status === "assigned");
    const waitingEntries = state.queue.filter(q => q.status === "waiting");

    if (assignedPasses.length !== 1 || assignedEntries.length !== 1 || waitingEntries.length !== 2) {
      console.error("Invariant failure: assignedPasses=" + assignedPasses.length + ", assignedEntries=" + assignedEntries.length + ", waiting=" + waitingEntries.length);
      process.exit(1);
    }

    if (assignedPasses[0].passId !== "pass_goedvolk_1") {
      console.error("Expected pass_goedvolk_1 to be assigned, got: " + assignedPasses[0].passId);
      process.exit(1);
    }

    // Monotonic queue check: assigned entry must have the lowest ID among all 3 queue entries
    const allEntries = [...state.queue].sort((a, b) => a.id - b.id);
    if (allEntries[0].status !== "assigned" || allEntries[1].status !== "waiting" || allEntries[2].status !== "waiting") {
      console.error("Monotonic ordering violation: entries=" + JSON.stringify(allEntries));
      process.exit(1);
    }

    if (state.version !== 4) {
      console.error("Version failure: expected 4, got " + state.version);
      process.exit(1);
    }

    const joinEvents = state.events.filter(e => e.type === "queue.joined");
    const releaseEvents = state.events.filter(e => e.type === "pass.released");
    const assignedEvents = state.events.filter(e => e.type === "pass.assigned");

    if (joinEvents.length !== 3 || releaseEvents.length !== 1 || assignedEvents.length !== 1) {
      console.error("Events count mismatch: joins=" + joinEvents.length + ", releases=" + releaseEvents.length + ", assigns=" + assignedEvents.length);
      process.exit(1);
    }

    console.log("  ✓ Scenario 2 passed (1 assigned to lowest entry ID, 2 waiting, version=4)");
  ' "$STATE_JSON"

  # --------------------------------------------------------------------------
  # Scenario 3: Give-Back & Concurrent Queue Join
  # --------------------------------------------------------------------------
  echo "--- [Scenario 3] Give-Back & Concurrent Queue Join ---"
  pnpm tsx scripts/setup-test-pool.ts giveback > /dev/null

  RESP_DIR=$(mktemp -d)
  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/pass/pass_goedvolk_1/indicate" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_daan" \
    -H "Idempotency-Key: s3-giveback-daan-$iteration-$RANDOM" \
    -d '{"action":"giveBack"}' -o "$RESP_DIR/giveback_daan.body" > "$RESP_DIR/giveback_daan.code" &
  PID1=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_eva" \
    -H "Idempotency-Key: s3-join-eva-$iteration-$RANDOM" \
    -d '{"kind":"self"}' -o "$RESP_DIR/join_eva.body" > "$RESP_DIR/join_eva.code" &
  PID2=$!

  wait $PID1 $PID2

  CODE1=$(cat "$RESP_DIR/giveback_daan.code")
  CODE2=$(cat "$RESP_DIR/join_eva.code")

  if [ "$CODE1" -ne 200 ] || [ "$CODE2" -ne 200 ]; then
    echo "❌ Scenario 3 request failed: daan giveback=$CODE1, eva join=$CODE2"
    echo "Daan body: $(cat "$RESP_DIR/giveback_daan.body")"
    echo "Eva body: $(cat "$RESP_DIR/join_eva.body")"
    rm -rf "$RESP_DIR"
    exit 1
  fi
  rm -rf "$RESP_DIR"

  STATE_OUTPUT=$(pnpm tsx scripts/inspect-race-state.ts "$POOL_ID")
  STATE_JSON=$(echo "$STATE_OUTPUT" | sed -n 's/.*__STATE_START__\(.*\)__STATE_END__.*/\1/p')

  node -e '
    const state = JSON.parse(process.argv[1]);
    const assignedPasses = state.passStates.filter(p => p.status === "assigned");
    const assignedEntries = state.queue.filter(q => q.status === "assigned");
    const cancelledEntries = state.queue.filter(q => q.status === "cancelled");
    const waitingEntries = state.queue.filter(q => q.status === "waiting");

    if (assignedPasses.length !== 1 || assignedEntries.length !== 1 || cancelledEntries.length !== 1 || waitingEntries.length !== 0) {
      console.error("Invariant failure in scenario 3: assignedPasses=" + assignedPasses.length + ", assignedEntries=" + assignedEntries.length + ", cancelled=" + cancelledEntries.length + ", waiting=" + waitingEntries.length);
      process.exit(1);
    }

    const assignedEntry = assignedEntries[0];
    if (assignedEntry.memberId !== "member_goedvolk_eva" || assignedEntry.assignedPassId !== "pass_goedvolk_1") {
      console.error("Expected pass_goedvolk_1 to be reassigned to Eva, got: " + JSON.stringify(assignedEntry));
      process.exit(1);
    }

    if (cancelledEntries[0].memberId !== "member_goedvolk_daan") {
      console.error("Expected Daan entry to be cancelled, got: " + JSON.stringify(cancelledEntries[0]));
      process.exit(1);
    }

    if (state.version !== 4) {
      console.error("Version failure: expected 4, got " + state.version);
      process.exit(1);
    }

    console.log("  ✓ Scenario 3 passed (pass given back and cleanly reassigned to Eva, version=4)");
  ' "$STATE_JSON"

  # --------------------------------------------------------------------------
  # Scenario 4: Idempotent Replay Under Contention
  # --------------------------------------------------------------------------
  echo "--- [Scenario 4] Idempotent Replay Under Contention ---"
  pnpm tsx scripts/setup-test-pool.ts default > /dev/null

  REPLAY_KEY="s4-replay-key-$iteration-$RANDOM"
  RESP_DIR=$(mktemp -d)

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_daan" \
    -H "Idempotency-Key: $REPLAY_KEY" \
    -d '{"kind":"self"}' -o "$RESP_DIR/replay_1.body" > "$RESP_DIR/replay_1.code" &
  PID1=$!

  curl -s -w "%{http_code}" -X POST "$BASE_URL/api/pool/$POOL_ID/queue" \
    -H "Content-Type: application/json" \
    -H "Cookie: passie_member=member_goedvolk_daan" \
    -H "Idempotency-Key: $REPLAY_KEY" \
    -d '{"kind":"self"}' -o "$RESP_DIR/replay_2.body" > "$RESP_DIR/replay_2.code" &
  PID2=$!

  wait $PID1 $PID2

  CODE1=$(cat "$RESP_DIR/replay_1.code")
  CODE2=$(cat "$RESP_DIR/replay_2.code")

  if [ "$CODE1" -ne 200 ] || [ "$CODE2" -ne 200 ]; then
    echo "❌ Scenario 4 request failed: replay1=$CODE1, replay2=$CODE2"
    echo "Replay 1 body: $(cat "$RESP_DIR/replay_1.body")"
    echo "Replay 2 body: $(cat "$RESP_DIR/replay_2.body")"
    rm -rf "$RESP_DIR"
    exit 1
  fi
  rm -rf "$RESP_DIR"

  STATE_OUTPUT=$(pnpm tsx scripts/inspect-race-state.ts "$POOL_ID")
  STATE_JSON=$(echo "$STATE_OUTPUT" | sed -n 's/.*__STATE_START__\(.*\)__STATE_END__.*/\1/p')

  node -e '
    const state = JSON.parse(process.argv[1]);
    if (state.queue.length !== 1) {
      console.error("Idempotency violation: expected exactly 1 queue entry, got " + state.queue.length);
      process.exit(1);
    }

    if (state.version !== 1) {
      console.error("Idempotency version violation: expected version 1, got " + state.version);
      process.exit(1);
    }

    const joinEvents = state.events.filter(e => e.type === "queue.joined");
    if (joinEvents.length !== 1) {
      console.error("Idempotency events violation: expected 1 queue.joined event, got " + joinEvents.length);
      process.exit(1);
    }

    console.log("  ✓ Scenario 4 passed (1 queue entry, version=1, exactly 1 event)");
  ' "$STATE_JSON"

done

echo ""
echo "🎉 All $ITERATIONS iteration(s) across all 4 contention scenarios passed deterministically with zero flakes!"
