import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildPoolSnapshot } from "../snapshot";
import { createTestDb, setupIsolatedTestPool, cleanupTestPoolData } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";

describe("buildPoolSnapshot tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;

  const fixtureId = "fix_test_snapshot";
  const poolId = "pool_group_goedvolk_fix_test_snapshot";

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;
  });

  afterAll(async () => {
    await cleanupTestPoolData(db, poolId, fixtureId);
    if (proxy) {
      await proxy.dispose();
    }
  });

  beforeEach(async () => {
    await setupIsolatedTestPool(db, poolId, fixtureId);
  });

  it("returns null when pool ID does not exist", async () => {
    const snapshot = await buildPoolSnapshot(db, "non_existent_pool", null);
    expect(snapshot).toBeNull();
  });

  it("builds initial snapshot with correct club branding, fixture info, and default counts", async () => {
    const snapshot = await buildPoolSnapshot(db, poolId, "member_goedvolk_sam");
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot.id).toBe(poolId);
    expect(snapshot.version).toBe(0);
    expect(snapshot.status).toBe("open");

    // Club
    expect(snapshot.club.slug).toBe("excelsior");
    expect(snapshot.club.colorPrimary).toBe("#E30613");

    // Fixture
    expect(snapshot.fixture.opponent).toBe("Test FC");
    expect(snapshot.fixture.status).toBe("scheduled");

    // Acting member
    expect(snapshot.actingMember?.id).toBe("member_goedvolk_sam");
    expect(snapshot.actingMember?.displayName).toBe("Sam");

    // Deadline
    expect(snapshot.deadline.passed).toBe(false);

    // Initial counts (10 passes in seed for goedvolk, all unindicated)
    expect(snapshot.counts.unindicated).toBe(10);
    expect(snapshot.counts.kept).toBe(0);
    expect(snapshot.counts.released).toBe(0);
    expect(snapshot.counts.assigned).toBe(0);
    expect(snapshot.counts.waiting).toBe(0);
  });

  it("computes permission flags (canIndicate, canGiveBack, canCancel) accurately", async () => {
    const now = Math.floor(Date.now() / 1000);

    // Setup:
    // Pass 1 (Sam owner): status = 'assigned' to entry 1 (Daan)
    // Pass 2 (Ilse & Noor owners): status = 'unindicated'
    // Pass 3 (Bram owner, holder Daan): status = 'kept' by Bram
    // Queue:
    // Entry 1: Daan, status = 'assigned' to Pass 1
    // Entry 2: Eva, status = 'waiting'
    // Entry 3: Sam, status = 'cancelled'

    const insertedQueue = await db
      .insert(schema.queueEntries)
      .values([
        {
          gamePoolId: poolId,
          memberId: "member_goedvolk_daan",
          kind: "self",
          guestName: null,
          status: "assigned",
          assignedPassId: "pass_goedvolk_1",
          assignedAt: now,
          createdAt: now,
        },
        {
          gamePoolId: poolId,
          memberId: "member_goedvolk_eva",
          kind: "guest",
          guestName: "Eva Guest",
          status: "waiting",
          createdAt: now + 5,
        },
        {
          gamePoolId: poolId,
          memberId: "member_goedvolk_sam",
          kind: "self",
          guestName: null,
          status: "cancelled",
          createdAt: now + 10,
        },
      ])
      .returning();

    const daanEntryId = insertedQueue[0]!.id;
    const evaEntryId = insertedQueue[1]!.id;

    await db
      .update(schema.passGameStates)
      .set({
        status: "assigned",
        indicatedByMemberId: "member_goedvolk_sam",
        indicatedAt: now,
        releasedAt: now,
        claimantEntryId: daanEntryId,
        assignedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_1`));

    await db
      .update(schema.passGameStates)
      .set({
        status: "kept",
        indicatedByMemberId: "member_goedvolk_bram",
        indicatedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_3`));

    // Test permissions as Sam (owner of pass 1, but pass 1 is assigned -> cannot indicate; claimant is Daan -> cannot give back)
    const samSnapshot = await buildPoolSnapshot(db, poolId, "member_goedvolk_sam");
    expect(samSnapshot).not.toBeNull();
    if (!samSnapshot) return;

    const samPass1 = samSnapshot.passes.find((p) => p.id === "pass_goedvolk_1");
    expect(samPass1?.canIndicate).toBe(false); // already assigned
    expect(samPass1?.canGiveBack).toBe(false); // Sam is not claimant

    // Test permissions as Daan (claimant of pass 1 -> can give back; not owner -> cannot indicate)
    const daanSnapshot = await buildPoolSnapshot(db, poolId, "member_goedvolk_daan");
    expect(daanSnapshot).not.toBeNull();
    if (!daanSnapshot) return;

    const daanPass1 = daanSnapshot.passes.find((p) => p.id === "pass_goedvolk_1");
    expect(daanPass1?.canGiveBack).toBe(true);
    expect(daanPass1?.canIndicate).toBe(false);

    // Test permissions as Noor (co-owner of pass 2 -> can indicate; pass 2 unindicated)
    const noorSnapshot = await buildPoolSnapshot(db, poolId, "member_goedvolk_noor");
    expect(noorSnapshot).not.toBeNull();
    if (!noorSnapshot) return;

    const noorPass2 = noorSnapshot.passes.find((p) => p.id === "pass_goedvolk_2");
    expect(noorPass2?.canIndicate).toBe(true);

    // Queue entries permissions and positions
    // Eva is acting member -> entry 2 isMine=true, canCancel=true, position=1
    const evaSnapshot = await buildPoolSnapshot(db, poolId, "member_goedvolk_eva");
    expect(evaSnapshot).not.toBeNull();
    if (!evaSnapshot) return;

    const evaEntry = evaSnapshot.queue.find((q) => q.entryId === evaEntryId);
    expect(evaEntry?.position).toBe(1);
    expect(evaEntry?.isMine).toBe(true);
    expect(evaEntry?.canCancel).toBe(true);
    expect(evaEntry?.kind).toBe("guest");
    expect(evaEntry?.guestName).toBe("Eva Guest");

    const daanEntryInEva = evaSnapshot.queue.find((q) => q.entryId === daanEntryId);
    expect(daanEntryInEva?.position).toBe(0); // assigned entries have position 0
    expect(daanEntryInEva?.isMine).toBe(false);
    expect(daanEntryInEva?.canCancel).toBe(false);
    expect(daanEntryInEva?.assignedPassLabel).toBe("Pas 1");
  });

  it("calculates transfer tasks when holder differs from expected holder and prioritizes acting member tasks", async () => {
    const now = Math.floor(Date.now() / 1000);

    // Pass 1: holder = Sam, expectedHolder = Daan (assigned) -> Transfer: Sam -> Daan
    // Pass 3: holder = Daan (in seed), owner = Bram, kept by Bram -> expectedHolder = Bram -> Transfer: Daan -> Bram
    // Pass 2: holder = Ilse (in seed), unindicated -> expectedHolder = Ilse -> No transfer needed

    const insertedQueue = await db
      .insert(schema.queueEntries)
      .values({
        gamePoolId: poolId,
        memberId: "member_goedvolk_daan",
        kind: "self",
        guestName: null,
        status: "assigned",
        assignedPassId: "pass_goedvolk_1",
        assignedAt: now,
        createdAt: now,
      })
      .returning();

    const daanEntryId = insertedQueue[0]!.id;

    await db
      .update(schema.passGameStates)
      .set({
        status: "assigned",
        indicatedByMemberId: "member_goedvolk_sam",
        indicatedAt: now,
        releasedAt: now,
        claimantEntryId: daanEntryId,
        assignedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_1`));

    await db
      .update(schema.passGameStates)
      .set({
        status: "kept",
        indicatedByMemberId: "member_goedvolk_bram",
        indicatedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_3`));

    // When viewed by Sam (involved in Pass 1 transfer: Sam -> Daan)
    const samSnapshot = await buildPoolSnapshot(db, poolId, "member_goedvolk_sam");
    expect(samSnapshot).not.toBeNull();
    if (!samSnapshot) return;

    expect(samSnapshot.transfers.length).toBe(2);
    // Task involving Sam should be first
    expect(samSnapshot.transfers[0]?.passId).toBe("pass_goedvolk_1");
    expect(samSnapshot.transfers[0]?.from?.id).toBe("member_goedvolk_sam");
    expect(samSnapshot.transfers[0]?.to.id).toBe("member_goedvolk_daan");
    expect(samSnapshot.transfers[0]?.involvesMe).toBe(true);

    // Second task: Daan -> Bram
    expect(samSnapshot.transfers[1]?.passId).toBe("pass_goedvolk_3");
    expect(samSnapshot.transfers[1]?.from?.id).toBe("member_goedvolk_daan");
    expect(samSnapshot.transfers[1]?.to.id).toBe("member_goedvolk_bram");
    expect(samSnapshot.transfers[1]?.involvesMe).toBe(false);
  });

  it("formats timeline text with valid Dutch strings and actor metadata", async () => {
    const now = Math.floor(Date.now() / 1000);

    await db.insert(schema.activityEvents).values([
      {
        id: "evt_test_join",
        gamePoolId: poolId,
        passId: null,
        actorMemberId: "member_goedvolk_daan",
        type: "queue.joined",
        payloadJson: JSON.stringify({ entryId: 1, memberId: "member_goedvolk_daan", kind: "self" }),
        createdAt: now,
      },
      {
        id: "evt_test_release",
        gamePoolId: poolId,
        passId: "pass_goedvolk_1",
        actorMemberId: "member_goedvolk_sam",
        type: "pass.released",
        payloadJson: JSON.stringify({ passId: "pass_goedvolk_1" }),
        createdAt: now + 5,
      },
    ]);

    const snapshot = await buildPoolSnapshot(db, poolId, "member_goedvolk_sam");
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot.timeline.length).toBeGreaterThanOrEqual(2);
    const joinEvent = snapshot.timeline.find((e) => e.type === "queue.joined");
    expect(joinEvent).toBeDefined();
    expect(joinEvent?.actor?.displayName).toBe("Daan");
    expect(joinEvent?.text).toContain("Daan");

    const releaseEvent = snapshot.timeline.find((e) => e.type === "pass.released");
    expect(releaseEvent).toBeDefined();
    expect(releaseEvent?.actor?.displayName).toBe("Sam");
    expect(releaseEvent?.text).toContain("Pas 1");
  });
});
