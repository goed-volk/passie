import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ensurePool, findNextHomeFixture } from "../ensurePool";
import { createTestDb, cleanupTestPoolData } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";

describe("ensurePool & findNextHomeFixture tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;

  const fixtureId1 = "fix_test_ensure_1";
  const fixtureId2 = "fix_test_ensure_2";
  const poolId1 = "pool_group_goedvolk_fix_test_ensure_1";
  const poolId2 = "pool_group_goedvolk_fix_test_ensure_2";

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;
  });

  afterAll(async () => {
    await cleanupTestPoolData(db, poolId1, fixtureId1);
    await cleanupTestPoolData(db, poolId2, fixtureId2);
    if (proxy) {
      await proxy.dispose();
    }
  });

  beforeEach(async () => {
    await cleanupTestPoolData(db, poolId1, fixtureId1);
    await cleanupTestPoolData(db, poolId2, fixtureId2);
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_test_past"));
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_test_away"));
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_test_next_home"));
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_test_later_home"));
  });

  it("throws error if fixture does not exist", async () => {
    await expect(
      ensurePool(db, "group_goedvolk", "non_existent_fixture")
    ).rejects.toThrow("Fixture non_existent_fixture not found");
  });

  it("initializes game pool, initial version guard, pass game states, and pool.opened event", async () => {
    const now = Math.floor(Date.now() / 1000);

    // Insert test fixture
    await db.insert(schema.fixtures).values({
      id: fixtureId1,
      clubId: "club_excelsior",
      seasonId: "season_excelsior_2026_27",
      source: "manual",
      sourceUid: "uid_ensure_1",
      sourceSequence: 0,
      competition: "Eredivisie",
      opponent: "Ajax",
      isHome: 1,
      kickoffAt: now + 5 * 86400,
      venue: "Van Donge & De Roo Stadion",
      status: "scheduled",
      rawSummary: "Excelsior - Ajax",
      createdAt: now,
      updatedAt: now,
    });

    const pool = await ensurePool(db, "group_goedvolk", fixtureId1);
    expect(pool).toBeDefined();
    expect(pool.id).toBe(poolId1);
    expect(pool.groupId).toBe("group_goedvolk");
    expect(pool.fixtureId).toBe(fixtureId1);
    expect(pool.version).toBe(0);
    expect(pool.status).toBe("open");

    // Version guard v0
    const guard = await db.query.poolVersionGuards.findFirst({
      where: eq(schema.poolVersionGuards.gamePoolId, poolId1),
    });
    expect(guard).toBeDefined();
    expect(guard?.version).toBe(0);

    // Pass game states (10 passes for goedvolk)
    const passStates = await db.query.passGameStates.findMany({
      where: eq(schema.passGameStates.gamePoolId, poolId1),
    });
    expect(passStates.length).toBe(10);
    for (const ps of passStates) {
      expect(ps.status).toBe("unindicated");
      expect(ps.claimantEntryId).toBeNull();
    }

    // Activity event pool.opened
    const events = await db.query.activityEvents.findMany({
      where: eq(schema.activityEvents.gamePoolId, poolId1),
    });
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe("pool.opened");
  });

  it("is idempotent: calling ensurePool multiple times returns existing pool without duplicate records", async () => {
    const now = Math.floor(Date.now() / 1000);

    await db.insert(schema.fixtures).values({
      id: fixtureId2,
      clubId: "club_excelsior",
      seasonId: "season_excelsior_2026_27",
      source: "manual",
      sourceUid: "uid_ensure_2",
      sourceSequence: 0,
      competition: "Eredivisie",
      opponent: "Feyenoord",
      isHome: 1,
      kickoffAt: now + 6 * 86400,
      venue: "Van Donge & De Roo Stadion",
      status: "scheduled",
      rawSummary: "Excelsior - Feyenoord",
      createdAt: now,
      updatedAt: now,
    });

    const pool1 = await ensurePool(db, "group_goedvolk", fixtureId2);
    const pool2 = await ensurePool(db, "group_goedvolk", fixtureId2);

    expect(pool1.id).toBe(pool2.id);
    expect(pool1.version).toBe(pool2.version);

    const guards = await db.query.poolVersionGuards.findMany({
      where: eq(schema.poolVersionGuards.gamePoolId, poolId2),
    });
    expect(guards.length).toBe(1);

    const events = await db.query.activityEvents.findMany({
      where: eq(schema.activityEvents.gamePoolId, poolId2),
    });
    expect(events.length).toBe(1);
  });

  it("findNextHomeFixture returns earliest upcoming scheduled home match (kickoff >= now - 3h)", async () => {
    const now = Math.floor(Date.now() / 1000);

    // 1. Past home match (5 hours ago) -> should be excluded
    await db.insert(schema.fixtures).values({
      id: "fix_test_past",
      clubId: "club_excelsior",
      seasonId: "season_excelsior_2026_27",
      source: "manual",
      sourceUid: "uid_past",
      sourceSequence: 0,
      competition: "Eredivisie",
      opponent: "Past Opponent",
      isHome: 1,
      kickoffAt: now - 5 * 3600,
      venue: "Van Donge & De Roo Stadion",
      status: "scheduled",
      rawSummary: "Past Match",
      createdAt: now,
      updatedAt: now,
    });

    // 2. Upcoming away match -> should be excluded
    await db.insert(schema.fixtures).values({
      id: "fix_test_away",
      clubId: "club_excelsior",
      seasonId: "season_excelsior_2026_27",
      source: "manual",
      sourceUid: "uid_away",
      sourceSequence: 0,
      competition: "Eredivisie",
      opponent: "Away Opponent",
      isHome: 0,
      kickoffAt: now + 2 * 86400,
      venue: "Away Stadium",
      status: "scheduled",
      rawSummary: "Away Match",
      createdAt: now,
      updatedAt: now,
    });

    // 3. Earliest upcoming scheduled home match -> should be picked!
    await db.insert(schema.fixtures).values({
      id: "fix_test_next_home",
      clubId: "club_excelsior",
      seasonId: "season_excelsior_2026_27",
      source: "manual",
      sourceUid: "uid_next_home",
      sourceSequence: 0,
      competition: "Eredivisie",
      opponent: "Target Home Opponent",
      isHome: 1,
      kickoffAt: now + 3 * 86400,
      venue: "Van Donge & De Roo Stadion",
      status: "scheduled",
      rawSummary: "Target Home Match",
      createdAt: now,
      updatedAt: now,
    });

    // 4. Later upcoming scheduled home match -> should be after
    await db.insert(schema.fixtures).values({
      id: "fix_test_later_home",
      clubId: "club_excelsior",
      seasonId: "season_excelsior_2026_27",
      source: "manual",
      sourceUid: "uid_later_home",
      sourceSequence: 0,
      competition: "Eredivisie",
      opponent: "Later Home Opponent",
      isHome: 1,
      kickoffAt: now + 10 * 86400,
      venue: "Van Donge & De Roo Stadion",
      status: "scheduled",
      rawSummary: "Later Home Match",
      createdAt: now,
      updatedAt: now,
    });

    const nextHome = await findNextHomeFixture(db, "club_excelsior");
    expect(nextHome).not.toBeNull();
    expect(nextHome?.id).toBe("fix_test_next_home");
    expect(nextHome?.opponent).toBe("Target Home Opponent");

    // Clean up extra fixtures
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_test_past"));
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_test_away"));
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_test_next_home"));
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_test_later_home"));
  });
});
