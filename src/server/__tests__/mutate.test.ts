import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { mutate } from "../commit";
import { createTestDb, setupIsolatedTestPool, cleanupTestPoolData } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { eq, asc } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";

describe("mutate integration tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;

  const fixtureId = "fix_test_mutate";
  const poolId = "pool_group_goedvolk_fix_test_mutate";
  const fixtureIdB = "fix_test_mutate_b";
  const poolIdB = "pool_group_goedvolk_fix_test_mutate_b";

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;
  });

  afterAll(async () => {
    await cleanupTestPoolData(db, poolId, fixtureId);
    await cleanupTestPoolData(db, poolIdB, fixtureIdB);
    if (proxy) {
      await proxy.dispose();
    }
  });

  beforeEach(async () => {
    await setupIsolatedTestPool(db, poolId, fixtureId);
  });

  it("handles JoinQueue: creates queue entry, updates pool version and inserts version guard", async () => {
    const result = await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan",
      { idempotencyKey: "test-join-daan-1" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version).toBe(1);

    const pool = await db.query.gamePools.findFirst({
      where: eq(schema.gamePools.id, poolId),
    });
    expect(pool?.version).toBe(1);

    const guards = await db.query.poolVersionGuards.findMany({
      where: eq(schema.poolVersionGuards.gamePoolId, poolId),
      orderBy: [asc(schema.poolVersionGuards.version)],
    });
    expect(guards.map((g) => g.version)).toEqual([0, 1]);

    const queue = await db.query.queueEntries.findMany({
      where: eq(schema.queueEntries.gamePoolId, poolId),
    });
    expect(queue.length).toBe(1);
    expect(queue[0]?.memberId).toBe("member_goedvolk_daan");
    expect(queue[0]?.status).toBe("waiting");
  });

  it("handles IndicateKeep: marks pass as kept by owner", async () => {
    // Sam is owner of pass_goedvolk_1
    const result = await mutate(
      db,
      poolId,
      { type: "IndicateKeep", passId: "pass_goedvolk_1" },
      "member_goedvolk_sam",
      { idempotencyKey: "test-keep-sam-1" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version).toBe(1);

    const passState = await db.query.passGameStates.findFirst({
      where: eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_1`),
    });
    expect(passState?.status).toBe("kept");
    expect(passState?.indicatedByMemberId).toBe("member_goedvolk_sam");
  });

  it("handles IndicateRelease: releases pass and immediately assigns waiting queue entry", async () => {
    // First, Daan joins queue
    await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan",
      { idempotencyKey: "test-join-daan-2" }
    );

    // Then, Sam releases pass 1
    const result = await mutate(
      db,
      poolId,
      { type: "IndicateRelease", passId: "pass_goedvolk_1" },
      "member_goedvolk_sam",
      { idempotencyKey: "test-release-sam-1" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version).toBe(2);

    const passState = await db.query.passGameStates.findFirst({
      where: eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_1`),
    });
    expect(passState?.status).toBe("assigned");
    expect(passState?.claimantEntryId).toBeDefined();

    const queueEntry = await db.query.queueEntries.findFirst({
      where: eq(schema.queueEntries.gamePoolId, poolId),
    });
    expect(queueEntry?.status).toBe("assigned");
    expect(queueEntry?.assignedPassId).toBe("pass_goedvolk_1");
  });

  it("handles GiveBackAssignedPass: unassigns claimant and reallocates to next waiting entry", async () => {
    // 1. Daan joins queue
    await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan"
    );
    // 2. Eva joins queue
    await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_eva"
    );
    // 3. Sam releases pass 1 -> assigned to Daan
    await mutate(
      db,
      poolId,
      { type: "IndicateRelease", passId: "pass_goedvolk_1" },
      "member_goedvolk_sam"
    );

    // 4. Daan gives back pass 1
    const result = await mutate(
      db,
      poolId,
      { type: "GiveBackAssignedPass", passId: "pass_goedvolk_1" },
      "member_goedvolk_daan",
      { idempotencyKey: "test-giveback-daan-1" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version).toBe(4);

    const queueEntries = await db.query.queueEntries.findMany({
      where: eq(schema.queueEntries.gamePoolId, poolId),
      orderBy: [asc(schema.queueEntries.id)],
    });

    // Daan entry cancelled
    const daanEntry = queueEntries.find((q) => q.memberId === "member_goedvolk_daan");
    expect(daanEntry?.status).toBe("cancelled");

    // Eva entry assigned to pass 1
    const evaEntry = queueEntries.find((q) => q.memberId === "member_goedvolk_eva");
    expect(evaEntry?.status).toBe("assigned");
    expect(evaEntry?.assignedPassId).toBe("pass_goedvolk_1");

    const passState = await db.query.passGameStates.findFirst({
      where: eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_1`),
    });
    expect(passState?.status).toBe("assigned");
    expect(passState?.claimantEntryId).toBe(evaEntry?.id);
  });

  it("handles CancelQueueEntry: cancels waiting entry without renumbering", async () => {
    // 1. Daan joins queue (entry 1)
    await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan"
    );

    // 2. Eva joins queue (entry 2)
    await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_eva"
    );

    const queueBefore = await db.query.queueEntries.findMany({
      where: eq(schema.queueEntries.gamePoolId, poolId),
      orderBy: [asc(schema.queueEntries.id)],
    });
    const daanEntryId = queueBefore[0]!.id;
    const evaEntryId = queueBefore[1]!.id;

    // 3. Daan cancels entry 1
    const cancelResult = await mutate(
      db,
      poolId,
      { type: "CancelQueueEntry", entryId: daanEntryId },
      "member_goedvolk_daan"
    );
    expect(cancelResult.ok).toBe(true);

    const queueAfter = await db.query.queueEntries.findMany({
      where: eq(schema.queueEntries.gamePoolId, poolId),
      orderBy: [asc(schema.queueEntries.id)],
    });

    expect(queueAfter[0]?.id).toBe(daanEntryId);
    expect(queueAfter[0]?.status).toBe("cancelled");
    expect(queueAfter[1]?.id).toBe(evaEntryId);
    expect(queueAfter[1]?.status).toBe("waiting");
  });

  it("handles RecordHandover: updates pass holder, inserts possession and activity events", async () => {
    const result = await mutate(
      db,
      poolId,
      {
        type: "RecordHandover",
        passId: "pass_goedvolk_1",
        toMemberId: "member_goedvolk_eva",
        kind: "handover",
        note: "Handed over at stadium",
      },
      "member_goedvolk_sam",
      { idempotencyKey: "test-handover-sam-1" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version).toBe(1);

    // Verify passes table updated
    const pass = await db.query.passes.findFirst({
      where: eq(schema.passes.id, "pass_goedvolk_1"),
    });
    expect(pass?.holderMemberId).toBe("member_goedvolk_eva");

    // Verify possessionEvents record inserted
    const possEvents = await db.query.possessionEvents.findMany({
      where: eq(schema.possessionEvents.passId, "pass_goedvolk_1"),
    });
    expect(possEvents.length).toBeGreaterThanOrEqual(1);
    const lastPoss = possEvents[possEvents.length - 1];
    expect(lastPoss?.toMemberId).toBe("member_goedvolk_eva");
    expect(lastPoss?.fromMemberId).toBe("member_goedvolk_sam");
    expect(lastPoss?.actorMemberId).toBe("member_goedvolk_sam");

    // Reset pass holder back to Sam for test isolation
    await db
      .update(schema.passes)
      .set({ holderMemberId: "member_goedvolk_sam" })
      .where(eq(schema.passes.id, "pass_goedvolk_1"));
  });

  it("handles MarkFixtureRescheduled & MarkFixtureCancelled via mutate() with null actor", async () => {
    const reschedResult = await mutate(
      db,
      poolId,
      {
        type: "MarkFixtureRescheduled",
        newKickoffAt: 1788000000,
        newDeadlineAt: 1787913600,
      },
      null
    );

    expect(reschedResult.ok).toBe(true);
    if (!reschedResult.ok) return;
    expect(reschedResult.version).toBe(1);

    const pool = await db.query.gamePools.findFirst({
      where: eq(schema.gamePools.id, poolId),
    });
    expect(pool?.indicationDeadlineAt).toBe(1787913600);

    const cancelResult = await mutate(
      db,
      poolId,
      {
        type: "MarkFixtureCancelled",
      },
      null
    );

    expect(cancelResult.ok).toBe(true);
    if (!cancelResult.ok) return;
    expect(cancelResult.version).toBe(2);

    const cancelledPool = await db.query.gamePools.findFirst({
      where: eq(schema.gamePools.id, poolId),
    });
    expect(cancelledPool?.status).toBe("cancelled");
  });

  it("allocates strictly monotonic IDs for sequential joins", async () => {
    const r1 = await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan"
    );
    const r2 = await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_eva"
    );
    const r3 = await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_noor"
    );

    expect(r1.ok && r2.ok && r3.ok).toBe(true);

    const queue = await db.query.queueEntries.findMany({
      where: eq(schema.queueEntries.gamePoolId, poolId),
      orderBy: [asc(schema.queueEntries.id)],
    });

    expect(queue.length).toBe(3);
    expect(queue[0]!.id).toBeLessThan(queue[1]!.id);
    expect(queue[1]!.id).toBeLessThan(queue[2]!.id);
  });

  it("handles idempotent replay: returns current snapshot version with zero new writes", async () => {
    const key = "replay-key-12345";
    const res1 = await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan",
      { idempotencyKey: key }
    );
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;
    expect(res1.version).toBe(1);

    // Call mutate again with the exact same idempotencyKey
    const res2 = await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan",
      { idempotencyKey: key }
    );
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    expect(res2.version).toBe(1);

    const queue = await db.query.queueEntries.findMany({
      where: eq(schema.queueEntries.gamePoolId, poolId),
    });
    expect(queue.length).toBe(1);

    const events = await db.query.activityEvents.findMany({
      where: eq(schema.activityEvents.gamePoolId, poolId),
    });
    // evt_pool_opened_... + 1 queue.joined
    expect(events.length).toBe(2);
  });

  it("returns typed domain error and leaves DB untouched for illegal actions", async () => {
    // Noor is not an owner of pass_goedvolk_1 (Sam is)
    const result = await mutate(
      db,
      poolId,
      { type: "IndicateKeep", passId: "pass_goedvolk_1" },
      "member_goedvolk_noor"
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_PASS_OWNER");

    const pool = await db.query.gamePools.findFirst({
      where: eq(schema.gamePools.id, poolId),
    });
    expect(pool?.version).toBe(0);
  });

  it("returns POOL_NOT_FOUND when game pool does not exist", async () => {
    const result = await mutate(
      db,
      "non_existent_pool_id",
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan"
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("POOL_NOT_FOUND");
  });

  it("handles retry loop when version sentinel collides and succeeds on retry", async () => {
    // Insert a conflicting sentinel guard for version 1 to simulate a concurrent write committing first
    const now = Math.floor(Date.now() / 1000);
    await db.insert(schema.poolVersionGuards).values({
      gamePoolId: poolId,
      version: 1,
      createdAt: now,
    });
    // Also advance pool version to 1 to simulate the concurrent commit completing
    await db
      .update(schema.gamePools)
      .set({ version: 1, updatedAt: now })
      .where(eq(schema.gamePools.id, poolId));

    const result = await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version).toBe(2);

    const pool = await db.query.gamePools.findFirst({
      where: eq(schema.gamePools.id, poolId),
    });
    expect(pool?.version).toBe(2);
  });

  it("returns INTERNAL_ERROR when non-concurrency database error occurs", async () => {
    // Spy on console.error to avoid polluting test output with expected error logging
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Create a mock DB that throws an unexpected error on batch
    const brokenDb = new Proxy(db, {
      get(target, prop) {
        if (prop === "batch") {
          return async () => {
            throw new Error("Disk corruption or I/O failure");
          };
        }
        return Reflect.get(target, prop);
      },
    }) as DbClient;

    const result = await mutate(
      brokenDb,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan"
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(result.error.message).toBe("An internal database error occurred");

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("allows assigning the same pass in consecutive game pools without cross-pool constraint collisions", async () => {
    // Setup Pool A and Pool B
    await setupIsolatedTestPool(db, poolId, fixtureId);
    await setupIsolatedTestPool(db, poolIdB, fixtureIdB);

    // Pool A: Sam releases pass 1, Daan joins queue -> Daan gets assigned pass 1 in Pool A
    const releaseResA = await mutate(
      db,
      poolId,
      { type: "IndicateRelease", passId: "pass_goedvolk_1" },
      "member_goedvolk_sam",
      { idempotencyKey: "test-cross-release-a" }
    );
    expect(releaseResA.ok).toBe(true);

    const joinResA = await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_daan",
      { idempotencyKey: "test-cross-join-a" }
    );
    expect(joinResA.ok).toBe(true);

    const queueEntryA = await db.query.queueEntries.findFirst({
      where: eq(schema.queueEntries.gamePoolId, poolId),
    });
    expect(queueEntryA?.status).toBe("assigned");
    expect(queueEntryA?.assignedPassId).toBe("pass_goedvolk_1");

    // Pool B: Sam releases pass 1, Eva joins queue -> Eva gets assigned pass 1 in Pool B
    const releaseResB = await mutate(
      db,
      poolIdB,
      { type: "IndicateRelease", passId: "pass_goedvolk_1" },
      "member_goedvolk_sam",
      { idempotencyKey: "test-cross-release-b" }
    );
    expect(releaseResB.ok).toBe(true);

    const joinResB = await mutate(
      db,
      poolIdB,
      { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
      "member_goedvolk_eva",
      { idempotencyKey: "test-cross-join-b" }
    );
    expect(joinResB.ok).toBe(true);

    const queueEntryB = await db.query.queueEntries.findFirst({
      where: eq(schema.queueEntries.gamePoolId, poolIdB),
    });
    expect(queueEntryB?.status).toBe("assigned");
    expect(queueEntryB?.assignedPassId).toBe("pass_goedvolk_1");
  });
});
