import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ingestClubFixtures } from "../ingest";
import { createTestDb } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { and, eq } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";
import { ensurePool } from "../ensurePool";

describe("ingestClubFixtures tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;

  const sampleIcs = fs.readFileSync(
    path.resolve(__dirname, "./fixtures/excelsior-home.ics"),
    "utf-8"
  );

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;
  });

  afterAll(async () => {
    if (proxy) {
      await proxy.dispose();
    }
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.delete(schema.fixtures).where(eq(schema.fixtures.source, "ics"));
  });

  it("throws error for non-existent club", async () => {
    await expect(
      ingestClubFixtures(db, "non_existent_club")
    ).rejects.toThrow("Club non_existent_club not found");
  });

  it("parses ICS feed and inserts fixtures into database", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => sampleIcs,
    } as Response);

    const result = await ingestClubFixtures(db, "excelsior");
    expect(result.clubSlug).toBe("excelsior");
    expect(result.totalParsed).toBe(4);
    expect(result.inserted).toBeGreaterThanOrEqual(1);

    const fixture = await db.query.fixtures.findFirst({
      where: eq(schema.fixtures.sourceUid, "64235e165487771765001@fixtur.es"),
    });
    expect(fixture).toBeDefined();
    expect(fixture?.opponent).toBe("NEC");
    expect(fixture?.status).toBe("scheduled");
    expect(fixture?.isHome).toBe(1);
  });

  it("updates existing fixture and triggers pool reschedule event when kickoff changes", async () => {
    // 1. Initial ingestion
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => sampleIcs,
    } as Response);

    await ingestClubFixtures(db, "excelsior");

    const fixtureId = "fix_excelsior_64235e165487771765001@fixtur.es";
    const pool = await ensurePool(db, "group_goedvolk", fixtureId);

    // 2. Mock an updated ICS feed with rescheduled kickoff time
    const updatedIcs = sampleIcs.replace(
      "DTSTART:20260913T101500Z",
      "DTSTART:20260913T143000Z"
    );

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => updatedIcs,
    } as Response);

    const result = await ingestClubFixtures(db, "excelsior");
    expect(result.updated).toBeGreaterThanOrEqual(1);

    // Verify fixture kickoff updated
    const fixture = await db.query.fixtures.findFirst({
      where: eq(schema.fixtures.id, fixtureId),
    });
    expect(fixture?.kickoffAt).toBe(Math.floor(Date.parse("2026-09-13T14:30:00Z") / 1000));

    // Verify game_pools.version was incremented under mutate()
    const updatedPool = await db.query.gamePools.findFirst({
      where: eq(schema.gamePools.id, pool.id),
    });
    expect(updatedPool?.version).toBe(1);

    // Verify activity event fixture.rescheduled recorded
    const rescheduleEvent = await db.query.activityEvents.findFirst({
      where: and(
        eq(schema.activityEvents.type, "fixture.rescheduled"),
        eq(schema.activityEvents.gamePoolId, pool.id)
      ),
    });
    expect(rescheduleEvent).toBeDefined();
    expect(rescheduleEvent?.gamePoolId).toBe(pool.id);

    // Clean up
    await db.delete(schema.activityEvents).where(eq(schema.activityEvents.gamePoolId, pool.id));
    await db.delete(schema.poolVersionGuards).where(eq(schema.poolVersionGuards.gamePoolId, pool.id));
    await db.delete(schema.passGameStates).where(eq(schema.passGameStates.gamePoolId, pool.id));
    await db.delete(schema.gamePools).where(eq(schema.gamePools.id, pool.id));
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, fixtureId));
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_excelsior_64235e165487771765002@fixtur.es"));
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_excelsior_64235e165487771765003@fixtur.es"));
    await db.delete(schema.fixtures).where(eq(schema.fixtures.id, "fix_excelsior_64235e165487771765004@fixtur.es"));
  });
});
