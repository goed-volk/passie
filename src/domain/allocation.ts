// Pure allocation engine: pairs released passes with waiting queue entries.
// Invariants:
// 1. Allocation order is strictly `ORDER BY queue_entries.id ASC` (monotonic arrival order).
// 2. Pass allocation priority is deterministic: lowest `pass.sortOrder` released-unassigned pass first.
// 3. Pairing repeats until released unassigned passes or waiting queue entries are exhausted.

import type { PassState, QueueEntryState, ActivityEvent, ReduceContext } from "./types";

export interface AllocationResult {
  passes: PassState[];
  queue: QueueEntryState[];
  events: ActivityEvent[];
}

export function runAllocation(
  passes: PassState[],
  queue: QueueEntryState[],
  ctx: ReduceContext,
  gamePoolId: string
): AllocationResult {
  const events: ActivityEvent[] = [];

  // Deep clone or copy objects to maintain purity
  const newPasses = passes.map((p) => ({ ...p }));
  const newQueue = queue.map((q) => ({ ...q }));

  // Find all waiting queue entries, ordered strictly by id ASC
  const waitingEntries = newQueue
    .filter((q) => q.status === "waiting")
    .sort((a, b) => a.id - b.id);

  // Find all released passes that are unassigned, ordered by sortOrder ASC
  const availablePasses = newPasses
    .filter((p) => p.status === "released" && p.claimantEntryId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const pairsCount = Math.min(waitingEntries.length, availablePasses.length);

  for (let i = 0; i < pairsCount; i++) {
    const entry = waitingEntries[i]!;
    const pass = availablePasses[i]!;

    // Mutate the cloned instances
    entry.status = "assigned";
    entry.assignedPassId = pass.id;
    entry.assignedAt = ctx.now;

    pass.status = "assigned";
    pass.claimantEntryId = entry.id;
    pass.assignedAt = ctx.now;
    pass.updatedAt = ctx.now;

    events.push({
      id: ctx.nextEventId("pass.assigned"),
      gamePoolId,
      passId: pass.id,
      actorMemberId: ctx.actor,
      type: "pass.assigned",
      payload: {
        passId: pass.id,
        claimantEntryId: entry.id,
        memberId: entry.memberId,
        kind: entry.kind,
        guestName: entry.guestName,
      },
      idempotencyKey: null,
      createdAt: ctx.now,
    });
  }

  return {
    passes: newPasses,
    queue: newQueue,
    events,
  };
}
