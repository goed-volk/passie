import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadGamePoolState } from "../repo";
import { createTestDb, setupIsolatedTestPool, cleanupTestPoolData } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import type { PlatformProxy } from "wrangler";

describe("repo loadGamePoolState tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;

  const fixtureId = "fix_test_repo";
  const poolId = "pool_group_goedvolk_fix_test_repo";

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

  it("returns null for non-existent pool ID", async () => {
    const snapshot = await loadGamePoolState(db, "non_existent_pool_id");
    expect(snapshot).toBeNull();
  });

  it("loads existing pool with active passes, co-owners, and default unindicated states", async () => {
    const snapshot = await loadGamePoolState(db, poolId);
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot.state.id).toBe(poolId);
    expect(snapshot.state.fixtureId).toBe(fixtureId);
    expect(snapshot.state.status).toBe("open");
    expect(snapshot.version).toBe(0);

    // Group goedvolk has 10 passes in seed
    expect(snapshot.state.passes.length).toBeGreaterThan(0);

    // Check pass 1 (Sam is owner and holder)
    const pass1 = snapshot.state.passes.find((p) => p.id === "pass_goedvolk_1");
    expect(pass1).toBeDefined();
    expect(pass1?.owners).toContain("member_goedvolk_sam");
    expect(pass1?.holderMemberId).toBe("member_goedvolk_sam");
    expect(pass1?.status).toBe("unindicated");

    // Check pass 2 (Ilse and Noor are co-owners)
    const pass2 = snapshot.state.passes.find((p) => p.id === "pass_goedvolk_2");
    expect(pass2).toBeDefined();
    expect(pass2?.owners).toContain("member_goedvolk_ilse");
    expect(pass2?.owners).toContain("member_goedvolk_noor");

    // Initially queue is empty
    expect(snapshot.state.queue).toEqual([]);
    expect(snapshot.nextQueueEntryId).toBeGreaterThanOrEqual(1);
  });

  it("orders queue entries strictly by id ASC and computes max(id) + 1", async () => {
    const now = Math.floor(Date.now() / 1000);

    // Insert 3 queue entries with out-of-order created_at to verify ordering by id ASC
    await db.insert(schema.queueEntries).values([
      {
        id: 100,
        gamePoolId: poolId,
        memberId: "member_goedvolk_daan",
        kind: "self",
        guestName: null,
        status: "waiting",
        createdAt: now + 50,
      },
      {
        id: 101,
        gamePoolId: poolId,
        memberId: "member_goedvolk_eva",
        kind: "guest",
        guestName: "Eva Guest",
        status: "waiting",
        createdAt: now + 10,
      },
      {
        id: 102,
        gamePoolId: poolId,
        memberId: "member_goedvolk_noor",
        kind: "self",
        guestName: null,
        status: "waiting",
        createdAt: now + 20,
      },
    ]);

    const snapshot = await loadGamePoolState(db, poolId);
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot.state.queue.length).toBe(3);
    expect(snapshot.state.queue[0]?.id).toBe(100);
    expect(snapshot.state.queue[1]?.id).toBe(101);
    expect(snapshot.state.queue[2]?.id).toBe(102);

    expect(snapshot.state.queue[1]?.kind).toBe("guest");
    expect(snapshot.state.queue[1]?.guestName).toBe("Eva Guest");

    expect(snapshot.nextQueueEntryId).toBe(103);
  });
});
