import { describe, it, expect } from "vitest";
import { reduce } from "../engine";
import { computeIndicationDeadline, isDeadlinePassed } from "../deadlines";
import type { GamePoolState, ReduceContext, PassState, Action } from "../types";

function createMockContext(overrides?: Partial<ReduceContext>): ReduceContext {
  let eventSeq = 1;
  return {
    now: 1700000000,
    actor: "member_sam",
    nextEventId: (type) => `evt_${type}_${eventSeq++}`,
    idempotencyKey: "mock-idempotency-key",
    ...overrides,
  };
}

function applyAction(state: GamePoolState, action: Action, ctx: ReduceContext): GamePoolState {
  const result = reduce(state, action, ctx);
  if ("state" in result) {
    return result.state;
  }
  throw new Error(`Unexpected error in test setup: ${result.error.code} - ${result.error.message}`);
}

function createInitialState(overrides?: Partial<GamePoolState>): GamePoolState {
  const passes: PassState[] = [
    {
      id: "pass_1",
      sortOrder: 1,
      owners: ["member_sam"],
      holderMemberId: "member_sam",
      status: "unindicated",
      indicatedByMemberId: null,
      indicatedAt: null,
      releasedAt: null,
      claimantEntryId: null,
      assignedAt: null,
      updatedAt: 1700000000,
    },
    {
      id: "pass_2",
      sortOrder: 2,
      owners: ["member_ilse", "member_noor"],
      holderMemberId: "member_ilse",
      status: "unindicated",
      indicatedByMemberId: null,
      indicatedAt: null,
      releasedAt: null,
      claimantEntryId: null,
      assignedAt: null,
      updatedAt: 1700000000,
    },
    {
      id: "pass_3",
      sortOrder: 3,
      owners: ["member_bram"],
      holderMemberId: "member_daan",
      status: "unindicated",
      indicatedByMemberId: null,
      indicatedAt: null,
      releasedAt: null,
      claimantEntryId: null,
      assignedAt: null,
      updatedAt: 1700000000,
    },
  ];

  return {
    id: "pool_1",
    fixtureId: "fix_1",
    status: "open",
    indicationDeadlineAt: 1700050000,
    version: 0,
    passes,
    queue: [],
    ...overrides,
  };
}

describe("Deadlines", () => {
  it("computes indication deadline from kickoff and offset", () => {
    const kickoff = 1700086400; // kickoff
    const deadline = computeIndicationDeadline(kickoff, 24 * 60 * 60);
    expect(deadline).toBe(kickoff - 86400);
  });

  it("checks if deadline has passed", () => {
    const deadline = 1700000000;
    expect(isDeadlinePassed(deadline, 1699999999)).toBe(false);
    expect(isDeadlinePassed(deadline, 1700000000)).toBe(true);
    expect(isDeadlinePassed(deadline, 1700000001)).toBe(true);
  });
});

describe("Domain Engine Edge Cases", () => {
  // Edge case 1: Two members request a seat, then one pass is released -> lowest entry id wins; the other stays waiting.
  it("Edge case 1: lowest entry id wins when pass is released, other entry stays waiting", () => {
    let state = createInitialState();
    const ctx1 = createMockContext({ actor: "member_daan", now: 1700000010 });
    const ctx2 = createMockContext({ actor: "member_eva", now: 1700000020 });
    const ctxRelease = createMockContext({ actor: "member_sam", now: 1700000030 });

    // member_daan joins queue (id: 1)
    const join1 = reduce(state, { type: "JoinQueue", nextEntryId: 1, kind: "self" }, ctx1);
    expect("state" in join1).toBe(true);
    if ("state" in join1) state = join1.state;

    // member_eva joins queue (id: 2)
    const join2 = reduce(state, { type: "JoinQueue", nextEntryId: 2, kind: "self" }, ctx2);
    expect("state" in join2).toBe(true);
    if ("state" in join2) state = join2.state;

    expect(state.queue).toHaveLength(2);
    expect(state.queue[0]?.status).toBe("waiting");
    expect(state.queue[1]?.status).toBe("waiting");

    // member_sam releases pass_1
    const release = reduce(state, { type: "IndicateRelease", passId: "pass_1" }, ctxRelease);
    expect("state" in release).toBe(true);
    if ("state" in release) {
      state = release.state;
      // Entry 1 (daan) should be assigned pass_1
      const entry1 = state.queue.find((q) => q.id === 1);
      const entry2 = state.queue.find((q) => q.id === 2);
      const pass1 = state.passes.find((p) => p.id === "pass_1");

      expect(entry1?.status).toBe("assigned");
      expect(entry1?.assignedPassId).toBe("pass_1");
      expect(pass1?.status).toBe("assigned");
      expect(pass1?.claimantEntryId).toBe(1);

      // Entry 2 (eva) stays waiting
      expect(entry2?.status).toBe("waiting");
      expect(entry2?.assignedPassId).toBeNull();
    }
  });

  // Edge case 2: Two concurrent releases of two different passes while one entry waits -> exactly one pass becomes assigned; no entry is double-assigned.
  it("Edge case 2: release with one waiting entry assigns exactly one pass, leaving second released pass unassigned", () => {
    let state = createInitialState();
    const ctxJoin = createMockContext({ actor: "member_daan" });
    const ctxRel1 = createMockContext({ actor: "member_sam" });
    const ctxRel2 = createMockContext({ actor: "member_bram" });

    // Join queue (id: 1)
    const join = reduce(state, { type: "JoinQueue", nextEntryId: 1, kind: "self" }, ctxJoin);
    if ("state" in join) state = join.state;

    // Release pass 1
    const rel1 = reduce(state, { type: "IndicateRelease", passId: "pass_1" }, ctxRel1);
    if ("state" in rel1) state = rel1.state;

    // Release pass 3 (while entry 1 is already assigned)
    const rel2 = reduce(state, { type: "IndicateRelease", passId: "pass_3" }, ctxRel2);
    if ("state" in rel2) state = rel2.state;

    const pass1 = state.passes.find((p) => p.id === "pass_1");
    const pass3 = state.passes.find((p) => p.id === "pass_3");
    const entry1 = state.queue.find((q) => q.id === 1);

    expect(pass1?.status).toBe("assigned");
    expect(pass1?.claimantEntryId).toBe(1);
    expect(pass3?.status).toBe("released");
    expect(pass3?.claimantEntryId).toBeNull();
    expect(entry1?.status).toBe("assigned");
    expect(entry1?.assignedPassId).toBe("pass_1");
  });

  // Edge case 3: Concurrent release of the SAME pass twice (double tap / two co-owners) -> idempotent: one assignment, no duplicate events.
  it("Edge case 3: duplicate release of the same pass is idempotent", () => {
    let state = createInitialState();
    const ctxOwner1 = createMockContext({ actor: "member_ilse" });
    const ctxOwner2 = createMockContext({ actor: "member_noor" });

    // First co-owner releases pass_2
    const rel1 = reduce(state, { type: "IndicateRelease", passId: "pass_2" }, ctxOwner1);
    expect("state" in rel1).toBe(true);
    if ("state" in rel1) {
      state = rel1.state;
      expect(rel1.events.length).toBeGreaterThan(0);
    }

    // Second co-owner releases pass_2 again with no queue entries waiting
    const rel2 = reduce(state, { type: "IndicateRelease", passId: "pass_2" }, ctxOwner2);
    expect("state" in rel2).toBe(true);
    if ("state" in rel2) {
      expect(rel2.events).toHaveLength(0);
      expect(rel2.state.passes.find((p) => p.id === "pass_2")?.status).toBe("released");
    }
  });

  it("IndicateRelease on an already released pass reconciles allocation if a queue entry is waiting", () => {
    let state = createInitialState();
    const ctxOwner1 = createMockContext({ actor: "member_ilse" });
    const ctxOwner2 = createMockContext({ actor: "member_noor" });

    // 1. Release pass_2 with empty queue
    const rel1 = reduce(state, { type: "IndicateRelease", passId: "pass_2" }, ctxOwner1);
    expect("state" in rel1).toBe(true);
    if ("state" in rel1) state = rel1.state;

    expect(state.passes.find((p) => p.id === "pass_2")?.status).toBe("released");

    // 2. Queue entry joins without triggering allocation (simulate state)
    state = {
      ...state,
      queue: [
        {
          id: 1,
          memberId: "member_daan",
          kind: "self",
          guestName: null,
          status: "waiting",
          assignedPassId: null,
          assignedAt: null,
          cancelledAt: null,
          cancelledByMemberId: null,
          createdAt: 1700000020,
        },
      ],
    };

    // 3. Retry / re-call IndicateRelease on pass_2 -> should reconcile and assign pass_2 to entry 1
    const rel2 = reduce(state, { type: "IndicateRelease", passId: "pass_2" }, ctxOwner2);
    expect("state" in rel2).toBe(true);
    if ("state" in rel2) {
      expect(rel2.events).toHaveLength(1);
      expect(rel2.events[0]?.type).toBe("pass.assigned");
      expect(rel2.state.passes.find((p) => p.id === "pass_2")?.status).toBe("assigned");
      expect(rel2.state.passes.find((p) => p.id === "pass_2")?.claimantEntryId).toBe(1);
      expect(rel2.state.queue[0]?.status).toBe("assigned");
    }
  });

  // Edge case 4: Claimant cancels ("teruggeven") -> pass reassigns to the next waiting entry in the same commit.
  it("Edge case 4: GiveBackAssignedPass reassigns pass to next waiting entry in same commit", () => {
    let state = createInitialState();
    const ctxJoin1 = createMockContext({ actor: "member_daan" });
    const ctxJoin2 = createMockContext({ actor: "member_eva" });
    const ctxRel = createMockContext({ actor: "member_sam" });
    const ctxGiveBack = createMockContext({ actor: "member_daan" });

    // Join 1 and Join 2
    state = applyAction(state, { type: "JoinQueue", nextEntryId: 1, kind: "self" }, ctxJoin1);
    state = applyAction(state, { type: "JoinQueue", nextEntryId: 2, kind: "self" }, ctxJoin2);

    // Release pass_1 -> assigned to entry 1 (daan)
    const rel = reduce(state, { type: "IndicateRelease", passId: "pass_1" }, ctxRel);
    if ("state" in rel) state = rel.state;

    expect(state.passes.find((p) => p.id === "pass_1")?.claimantEntryId).toBe(1);

    // daan gives back pass_1
    const giveBack = reduce(state, { type: "GiveBackAssignedPass", passId: "pass_1" }, ctxGiveBack);
    expect("state" in giveBack).toBe(true);
    if ("state" in giveBack) {
      state = giveBack.state;
      const pass1 = state.passes.find((p) => p.id === "pass_1");
      const entry1 = state.queue.find((q) => q.id === 1);
      const entry2 = state.queue.find((q) => q.id === 2);

      expect(entry1?.status).toBe("cancelled");
      expect(pass1?.status).toBe("assigned");
      expect(pass1?.claimantEntryId).toBe(2);
      expect(entry2?.status).toBe("assigned");
      expect(entry2?.assignedPassId).toBe("pass_1");
    }
  });

  // Edge case 5: Member with two guest entries: first entry served, second keeps waiting and keeps its position.
  it("Edge case 5: member with two guest entries has first served while second remains waiting with original position", () => {
    let state = createInitialState();
    const ctxMember = createMockContext({ actor: "member_daan" });
    const ctxRel = createMockContext({ actor: "member_sam" });

    // daan joins for Guest A (id: 1) and Guest B (id: 2)
    state = applyAction(state, { type: "JoinQueue", nextEntryId: 1, kind: "guest", guestName: "Guest A" }, ctxMember);
    state = applyAction(state, { type: "JoinQueue", nextEntryId: 2, kind: "guest", guestName: "Guest B" }, ctxMember);

    // Release pass_1
    const rel = reduce(state, { type: "IndicateRelease", passId: "pass_1" }, ctxRel);
    if ("state" in rel) state = rel.state;

    const entry1 = state.queue.find((q) => q.id === 1);
    const entry2 = state.queue.find((q) => q.id === 2);

    expect(entry1?.status).toBe("assigned");
    expect(entry1?.guestName).toBe("Guest A");
    expect(entry2?.status).toBe("waiting");
    expect(entry2?.guestName).toBe("Guest B");
    expect(entry2?.id).toBe(2);
  });

  // Edge case 6: Member cancels their first entry while their second waits -> second keeps its original position.
  it("Edge case 6: member cancels their first entry while second waits; second preserves position and id", () => {
    let state = createInitialState();
    const ctxMember = createMockContext({ actor: "member_daan" });

    // daan joins for Guest A (id: 1) and Guest B (id: 2)
    state = applyAction(state, { type: "JoinQueue", nextEntryId: 1, kind: "guest", guestName: "Guest A" }, ctxMember);
    state = applyAction(state, { type: "JoinQueue", nextEntryId: 2, kind: "guest", guestName: "Guest B" }, ctxMember);

    // daan cancels entry 1
    const cancel = reduce(state, { type: "CancelQueueEntry", entryId: 1 }, ctxMember);
    expect("state" in cancel).toBe(true);
    if ("state" in cancel) {
      state = cancel.state;
      const entry1 = state.queue.find((q) => q.id === 1);
      const entry2 = state.queue.find((q) => q.id === 2);

      expect(entry1?.status).toBe("cancelled");
      expect(entry2?.status).toBe("waiting");
      expect(entry2?.id).toBe(2);
    }
  });

  // Edge case 7: IndicateKeep by owner
  it("Edge case 7: IndicateKeep marks pass as kept by owner", () => {
    const state = createInitialState();
    const ctx = createMockContext({ actor: "member_sam" });

    const keep = reduce(state, { type: "IndicateKeep", passId: "pass_1" }, ctx);
    expect("state" in keep).toBe(true);
    if ("state" in keep) {
      const pass1 = keep.state.passes.find((p) => p.id === "pass_1");
      expect(pass1?.status).toBe("kept");
      expect(pass1?.indicatedByMemberId).toBe("member_sam");
      expect(keep.events).toHaveLength(1);
      expect(keep.events[0]?.type).toBe("pass.kept");
    }
  });

  it("RecordHandover updates holderMemberId and emits possession event", () => {
    let state = createInitialState();
    const ctx = createMockContext({ actor: "member_sam" });

    const handover = reduce(
      state,
      { type: "RecordHandover", passId: "pass_1", toMemberId: "member_eva", kind: "handover" },
      ctx
    );

    expect("state" in handover).toBe(true);
    if ("state" in handover) {
      state = handover.state;
      const pass1 = state.passes.find((p) => p.id === "pass_1");
      expect(pass1?.holderMemberId).toBe("member_eva");
      expect(handover.events).toHaveLength(1);
      expect(handover.events[0]?.type).toBe("possession.handover");
      expect(handover.events[0]?.payload).toMatchObject({
        passId: "pass_1",
        fromMemberId: "member_sam",
        toMemberId: "member_eva",
        kind: "handover",
      });
    }

    // Idempotency: repeating handover to member_eva produces 0 events
    const repeated = reduce(
      state,
      { type: "RecordHandover", passId: "pass_1", toMemberId: "member_eva", kind: "handover" },
      ctx
    );
    expect("state" in repeated).toBe(true);
    if ("state" in repeated) {
      expect(repeated.events).toHaveLength(0);
    }
  });

  // Edge case 8: Kickoff moves -> deadline recomputed, pass/queue state preserved, timeline entry fixture.rescheduled
  it("Edge case 8: MarkFixtureRescheduled updates indication deadline and emits fixture.rescheduled event", () => {
    const state = createInitialState();
    const ctx = createMockContext({ actor: "system" });

    const resched = reduce(
      state,
      { type: "MarkFixtureRescheduled", newKickoffAt: 1700100000, newDeadlineAt: 1700013600 },
      ctx
    );

    expect("state" in resched).toBe(true);
    if ("state" in resched) {
      expect(resched.state.indicationDeadlineAt).toBe(1700013600);
      expect(resched.events).toHaveLength(1);
      expect(resched.events[0]?.type).toBe("fixture.rescheduled");
    }
  });

  // Edge case 9: Fixture cancelled -> pool marked cancelled, read-only
  it("Edge case 9: MarkFixtureCancelled marks pool cancelled and subsequent actions fail with POOL_NOT_OPEN", () => {
    let state = createInitialState();
    const ctx = createMockContext({ actor: "system" });

    const cancel = reduce(state, { type: "MarkFixtureCancelled" }, ctx);
    expect("state" in cancel).toBe(true);
    if ("state" in cancel) {
      state = cancel.state;
      expect(state.status).toBe("cancelled");
      expect(cancel.events[0]?.type).toBe("fixture.cancelled");
    }

    // Subsequent actions on cancelled pool should fail
    const tryJoin = reduce(state, { type: "JoinQueue", nextEntryId: 1, kind: "self" }, ctx);
    expect("error" in tryJoin).toBe(true);
    if ("error" in tryJoin) {
      expect(tryJoin.error.code).toBe("POOL_NOT_OPEN");
    }
  });

  // Permission & Validation Checks
  describe("Permissions and validation", () => {
    it("non-owner cannot indicate keep or release", () => {
      const state = createInitialState();
      const ctxNonOwner = createMockContext({ actor: "member_eva" });

      const tryKeep = reduce(state, { type: "IndicateKeep", passId: "pass_1" }, ctxNonOwner);
      expect("error" in tryKeep).toBe(true);
      if ("error" in tryKeep) {
        expect(tryKeep.error.code).toBe("NOT_PASS_OWNER");
      }

      const tryRel = reduce(state, { type: "IndicateRelease", passId: "pass_1" }, ctxNonOwner);
      expect("error" in tryRel).toBe(true);
      if ("error" in tryRel) {
        expect(tryRel.error.code).toBe("NOT_PASS_OWNER");
      }
    });

    it("owner can reclaim assigned pass via IndicateKeep, bumping claimant back to waiting", () => {
      let state = createInitialState();
      const ctxJoin = createMockContext({ actor: "member_eva" });
      const ctxRel = createMockContext({ actor: "member_sam" });

      state = applyAction(state, { type: "JoinQueue", nextEntryId: 1, kind: "self" }, ctxJoin);
      state = applyAction(state, { type: "IndicateRelease", passId: "pass_1" }, ctxRel);

      // pass_1 is now assigned to entry 1
      const passAssigned = state.passes.find((p) => p.id === "pass_1");
      expect(passAssigned?.status).toBe("assigned");
      expect(passAssigned?.claimantEntryId).toBe(1);

      // Sam reclaims pass_1
      const keep = reduce(state, { type: "IndicateKeep", passId: "pass_1" }, ctxRel);
      expect("state" in keep).toBe(true);
      if ("state" in keep) {
        const passKept = keep.state.passes.find((p) => p.id === "pass_1");
        expect(passKept?.status).toBe("kept");
        expect(passKept?.indicatedByMemberId).toBe("member_sam");
        expect(passKept?.claimantEntryId).toBeNull();

        const entryWaiting = keep.state.queue.find((q) => q.id === 1);
        expect(entryWaiting?.status).toBe("waiting");
        expect(entryWaiting?.assignedPassId).toBeNull();

        const reclaimEvent = keep.events.find((e) => e.type === "pass.reclaimed");
        expect(reclaimEvent).toBeDefined();
        expect(reclaimEvent?.payload.reclaimedFromMemberId).toBe("member_eva");
      }
    });

    it("non-claimant cannot give back assigned pass", () => {
      let state = createInitialState();
      const ctxJoin = createMockContext({ actor: "member_eva" });
      const ctxRel = createMockContext({ actor: "member_sam" });
      const ctxStranger = createMockContext({ actor: "member_daan" });

      state = applyAction(state, { type: "JoinQueue", nextEntryId: 1, kind: "self" }, ctxJoin);
      state = applyAction(state, { type: "IndicateRelease", passId: "pass_1" }, ctxRel);

      const tryGiveBack = reduce(state, { type: "GiveBackAssignedPass", passId: "pass_1" }, ctxStranger);
      expect("error" in tryGiveBack).toBe(true);
      if ("error" in tryGiveBack) {
        expect(tryGiveBack.error.code).toBe("NOT_CLAIMANT");
      }
    });

    it("non-owner of queue entry cannot cancel it", () => {
      let state = createInitialState();
      const ctxJoin = createMockContext({ actor: "member_eva" });
      const ctxStranger = createMockContext({ actor: "member_daan" });

      state = applyAction(state, { type: "JoinQueue", nextEntryId: 1, kind: "self" }, ctxJoin);

      const tryCancel = reduce(state, { type: "CancelQueueEntry", entryId: 1 }, ctxStranger);
      expect("error" in tryCancel).toBe(true);
      if ("error" in tryCancel) {
        expect(tryCancel.error.code).toBe("NOT_QUEUE_ENTRY_OWNER");
      }
    });

    it("returns PASS_NOT_FOUND when action targets a non-existent pass", () => {
      const state = createInitialState();
      const ctx = createMockContext({ actor: "member_sam" });

      const tryKeep = reduce(state, { type: "IndicateKeep", passId: "pass_nonexistent" }, ctx);
      expect("error" in tryKeep).toBe(true);
      if ("error" in tryKeep) {
        expect(tryKeep.error.code).toBe("PASS_NOT_FOUND");
      }

      const tryRel = reduce(state, { type: "IndicateRelease", passId: "pass_nonexistent" }, ctx);
      expect("error" in tryRel).toBe(true);
      if ("error" in tryRel) {
        expect(tryRel.error.code).toBe("PASS_NOT_FOUND");
      }

      const tryGiveBack = reduce(state, { type: "GiveBackAssignedPass", passId: "pass_nonexistent" }, ctx);
      expect("error" in tryGiveBack).toBe(true);
      if ("error" in tryGiveBack) {
        expect(tryGiveBack.error.code).toBe("PASS_NOT_FOUND");
      }

      const tryHandover = reduce(
        state,
        { type: "RecordHandover", passId: "pass_nonexistent", toMemberId: "member_eva" },
        ctx
      );
      expect("error" in tryHandover).toBe(true);
      if ("error" in tryHandover) {
        expect(tryHandover.error.code).toBe("PASS_NOT_FOUND");
      }
    });

    it("returns PASS_NOT_ASSIGNED when give back is attempted on unassigned pass", () => {
      const state = createInitialState();
      const ctx = createMockContext({ actor: "member_sam" });

      const tryGiveBack = reduce(state, { type: "GiveBackAssignedPass", passId: "pass_1" }, ctx);
      expect("error" in tryGiveBack).toBe(true);
      if ("error" in tryGiveBack) {
        expect(tryGiveBack.error.code).toBe("PASS_NOT_ASSIGNED");
      }
    });

    it("returns QUEUE_ENTRY_NOT_FOUND when cancelling non-existent entry", () => {
      const state = createInitialState();
      const ctx = createMockContext({ actor: "member_sam" });

      const tryCancel = reduce(state, { type: "CancelQueueEntry", entryId: 999 }, ctx);
      expect("error" in tryCancel).toBe(true);
      if ("error" in tryCancel) {
        expect(tryCancel.error.code).toBe("QUEUE_ENTRY_NOT_FOUND");
      }
    });

    it("returns QUEUE_ENTRY_NOT_WAITING when cancelling non-waiting entry", () => {
      let state = createInitialState();
      const ctx = createMockContext({ actor: "member_sam" });

      state = applyAction(state, { type: "JoinQueue", nextEntryId: 1, kind: "self" }, ctx);
      state = applyAction(state, { type: "CancelQueueEntry", entryId: 1 }, ctx);

      // Now entry 1 is cancelled
      const tryCancelAgain = reduce(state, { type: "CancelQueueEntry", entryId: 1 }, ctx);
      expect("error" in tryCancelAgain).toBe(true);
      if ("error" in tryCancelAgain) {
        expect(tryCancelAgain.error.code).toBe("QUEUE_ENTRY_NOT_WAITING");
      }
    });

    it("returns NOT_PASS_OWNER when actor is null on IndicateKeep or IndicateRelease", () => {
      const state = createInitialState();
      const ctxNoActor = createMockContext({ actor: null });

      const tryKeep = reduce(state, { type: "IndicateKeep", passId: "pass_1" }, ctxNoActor);
      expect("error" in tryKeep).toBe(true);
      if ("error" in tryKeep) {
        expect(tryKeep.error.code).toBe("NOT_PASS_OWNER");
      }

      const tryRel = reduce(state, { type: "IndicateRelease", passId: "pass_1" }, ctxNoActor);
      expect("error" in tryRel).toBe(true);
      if ("error" in tryRel) {
        expect(tryRel.error.code).toBe("NOT_PASS_OWNER");
      }
    });

    it("handles IndicateRelease on already assigned pass idempotently", () => {
      let state = createInitialState();
      const ctxJoin = createMockContext({ actor: "member_eva" });
      const ctxRel = createMockContext({ actor: "member_sam" });

      state = applyAction(state, { type: "JoinQueue", nextEntryId: 1, kind: "self" }, ctxJoin);
      state = applyAction(state, { type: "IndicateRelease", passId: "pass_1" }, ctxRel);

      // Now pass_1 is assigned. Repeating IndicateRelease on assigned pass should return state with no events.
      const repeatRel = reduce(state, { type: "IndicateRelease", passId: "pass_1" }, ctxRel);
      expect("state" in repeatRel).toBe(true);
      if ("state" in repeatRel) {
        expect(repeatRel.events).toHaveLength(0);
      }
    });

    it("triggers default branch on unexpected action", () => {
      const state = createInitialState();
      const ctx = createMockContext({ actor: "member_sam" });
      const res = reduce(state, { type: "InvalidType" } as unknown as Action, ctx);
      expect("error" in res).toBe(true);
      if ("error" in res) {
        expect(res.error.code).toBe("INVALID_ACTION");
      }
    });

    it("returns QUEUE_ENTRY_NOT_FOUND when giveback pass points to missing queue entry", () => {
      let state = createInitialState();
      const ctx = createMockContext({ actor: "member_sam" });
      // Force pass to assigned with a claimantEntryId that is not in queue
      state = {
        ...state,
        passes: state.passes.map((p) =>
          p.id === "pass_1"
            ? { ...p, status: "assigned" as const, claimantEntryId: 888 }
            : p
        ),
      };

      const tryGiveBack = reduce(state, { type: "GiveBackAssignedPass", passId: "pass_1" }, ctx);
      expect("error" in tryGiveBack).toBe(true);
      if ("error" in tryGiveBack) {
        expect(tryGiveBack.error.code).toBe("QUEUE_ENTRY_NOT_FOUND");
      }
    });

    it("reconcileAllocation calls runAllocation directly", async () => {
      const { reconcileAllocation } = await import("../allocation");
      const state = createInitialState();
      const ctx = createMockContext({ actor: "member_sam" });
      const res = reconcileAllocation(state.passes, state.queue, ctx, state.id);
      expect(res.passes).toHaveLength(state.passes.length);
    });

    it("handles RecordHandover with correction kind and note", () => {
      let state = createInitialState();
      const ctx = createMockContext({ actor: "member_sam" });

      const correction = reduce(
        state,
        {
          type: "RecordHandover",
          passId: "pass_1",
          toMemberId: "member_eva",
          kind: "correction",
          note: "Gecorrigeerd na wedstrijd",
        },
        ctx
      );

      expect("state" in correction).toBe(true);
      if ("state" in correction) {
        expect(correction.events[0]?.type).toBe("possession.corrected");
        expect(correction.events[0]?.payload.kind).toBe("correction");
        expect(correction.events[0]?.payload.note).toBe("Gecorrigeerd na wedstrijd");
      }
    });

    it("handles IndicateKeep when already kept by same owner idempotently", () => {
      let state = createInitialState();
      const ctx = createMockContext({ actor: "member_sam" });

      state = applyAction(state, { type: "IndicateKeep", passId: "pass_1" }, ctx);

      const repeatKeep = reduce(state, { type: "IndicateKeep", passId: "pass_1" }, ctx);
      expect("state" in repeatKeep).toBe(true);
      if ("state" in repeatKeep) {
        expect(repeatKeep.events).toHaveLength(0);
      }
    });
  });

  // Property-based invariant test over 200 random action sequences
  describe("Property-based invariant simulation (200 random actions)", () => {
    it("maintains core invariants across arbitrary sequences of actions", () => {
      let state = createInitialState();
      const members = ["member_sam", "member_ilse", "member_noor", "member_bram", "member_daan", "member_eva"];
      let nextEntryId = 1;
      let timestamp = 1700000000;

      // Seed a pseudo-random generator with fixed seed for determinism
      let seed = 42;
      function random() {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      }

      function choose<T>(arr: T[]): T {
        return arr[Math.floor(random() * arr.length)]!;
      }

      for (let i = 0; i < 200; i++) {
        timestamp += 10;
        const actor = choose(members);
        const actionTypeChoice = Math.floor(random() * 5);
        let action: Action;

        if (actionTypeChoice === 0) {
          const pass = choose(state.passes);
          action = { type: "IndicateKeep", passId: pass.id };
        } else if (actionTypeChoice === 1) {
          const pass = choose(state.passes);
          action = { type: "IndicateRelease", passId: pass.id };
        } else if (actionTypeChoice === 2) {
          action = {
            type: "JoinQueue",
            nextEntryId: nextEntryId++,
            kind: random() > 0.5 ? "self" : "guest",
            guestName: "Guest",
          };
        } else if (actionTypeChoice === 3) {
          const waitingEntries = state.queue.filter((q) => q.status === "waiting");
          if (waitingEntries.length > 0) {
            const entry = choose(waitingEntries);
            action = { type: "CancelQueueEntry", entryId: entry.id };
          } else {
            action = { type: "JoinQueue", nextEntryId: nextEntryId++, kind: "self" };
          }
        } else {
          const assignedPasses = state.passes.filter((p) => p.status === "assigned" && p.claimantEntryId !== null);
          if (assignedPasses.length > 0) {
            const pass = choose(assignedPasses);
            const entry = state.queue.find((q) => q.id === pass.claimantEntryId);
            action = { type: "GiveBackAssignedPass", passId: pass.id };
            // Set actor to claimant to test valid giveback or random actor to test rejection
            if (entry && random() > 0.3) {
              // actor is the claimant
              const ctx = createMockContext({ actor: entry.memberId, now: timestamp });
              const res = reduce(state, action, ctx);
              if ("state" in res) state = res.state;
              continue;
            }
          } else {
            const pass = choose(state.passes);
            action = { type: "IndicateRelease", passId: pass.id };
          }
        }

        const ctx = createMockContext({ actor, now: timestamp });
        const res = reduce(state, action, ctx);
        if ("state" in res) {
          state = res.state;
        }

        // Invariant 1: No pass has two claimants
        const assignedPassClaimants = state.passes
          .filter((p) => p.status === "assigned")
          .map((p) => p.claimantEntryId);
        expect(new Set(assignedPassClaimants).size).toBe(assignedPassClaimants.length);

        // Invariant 2: No entry has two passes
        const assignedEntryPasses = state.queue
          .filter((q) => q.status === "assigned")
          .map((q) => q.assignedPassId);
        expect(new Set(assignedEntryPasses).size).toBe(assignedEntryPasses.length);

        // Invariant 3: Waiting entries never coexist with unassigned released passes
        const waitingCount = state.queue.filter((q) => q.status === "waiting").length;
        const unassignedReleasedCount = state.passes.filter(
          (p) => p.status === "released" && p.claimantEntryId === null
        ).length;
        expect(waitingCount === 0 || unassignedReleasedCount === 0).toBe(true);

        // Invariant 4: Queue order never inverts (waiting entries are strictly sorted by id)
        const waitingEntries = state.queue.filter((q) => q.status === "waiting");
        for (let j = 0; j < waitingEntries.length - 1; j++) {
          expect(waitingEntries[j]!.id).toBeLessThan(waitingEntries[j + 1]!.id);
        }

        // Invariant 5: Each assigned pass points to an assigned entry and vice versa
        for (const pass of state.passes) {
          if (pass.status === "assigned") {
            const entry = state.queue.find((q) => q.id === pass.claimantEntryId);
            expect(entry).toBeDefined();
            expect(entry?.status).toBe("assigned");
            expect(entry?.assignedPassId).toBe(pass.id);
          }
        }
      }
    });
  });

  describe("Passless Member lifecycle", () => {
    it("allows a member with zero pass ownership to join queue, receive assignment, yield pass, and receive handover", () => {
      let state = createInitialState();
      const guestActor = "member_passless_guest";

      // 1. Passless member attempts to indicate release on pass_1 -> should fail with NOT_PASS_OWNER
      const failIndicate = reduce(state, { type: "IndicateRelease", passId: "pass_1" }, createMockContext({ actor: guestActor }));
      expect("error" in failIndicate).toBe(true);
      if ("error" in failIndicate) {
        expect(failIndicate.error.code).toBe("NOT_PASS_OWNER");
      }

      // 2. Passless member joins the queue for self
      const joinRes = reduce(
        state,
        { type: "JoinQueue", nextEntryId: 1, kind: "self" },
        createMockContext({ actor: guestActor })
      );
      expect("state" in joinRes).toBe(true);
      if (!("state" in joinRes)) return;
      state = joinRes.state;
      expect(state.queue.length).toBe(1);
      expect(state.queue[0]?.memberId).toBe(guestActor);
      expect(state.queue[0]?.status).toBe("waiting");

      // 3. Owner releases pass_1 -> auto-assigns to guestActor
      const releaseRes = reduce(
        state,
        { type: "IndicateRelease", passId: "pass_1" },
        createMockContext({ actor: "member_sam" })
      );
      expect("state" in releaseRes).toBe(true);
      if (!("state" in releaseRes)) return;
      state = releaseRes.state;

      const pass1 = state.passes.find((p) => p.id === "pass_1");
      expect(pass1?.status).toBe("assigned");
      expect(pass1?.claimantEntryId).toBe(1);
      expect(state.queue[0]?.status).toBe("assigned");
      expect(state.queue[0]?.assignedPassId).toBe("pass_1");

      // 4. Passless member gives back the assigned pass
      const giveBackRes = reduce(
        state,
        { type: "GiveBackAssignedPass", passId: "pass_1" },
        createMockContext({ actor: guestActor })
      );
      expect("state" in giveBackRes).toBe(true);
      if (!("state" in giveBackRes)) return;
      state = giveBackRes.state;

      const pass1After = state.passes.find((p) => p.id === "pass_1");
      expect(pass1After?.status).toBe("released");
      expect(pass1After?.claimantEntryId).toBeNull();
      expect(state.queue[0]?.status).toBe("cancelled");

      // 5. Physical handover to passless member
      const handoverRes = reduce(
        state,
        { type: "RecordHandover", passId: "pass_1", toMemberId: guestActor },
        createMockContext({ actor: "member_sam" })
      );
      expect("state" in handoverRes).toBe(true);
      if (!("state" in handoverRes)) return;
      state = handoverRes.state;

      const pass1Handover = state.passes.find((p) => p.id === "pass_1");
      expect(pass1Handover?.holderMemberId).toBe(guestActor);
    });
  });
});
