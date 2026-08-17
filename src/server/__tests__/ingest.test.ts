import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ingestClubFixtures,
  checkIngestCooldown,
  setLastIngestCompletedAt,
  getIngestCooldownSeconds,
} from "../ingest";
import { createTestDb } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { and, eq, inArray } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";
import { ensurePool } from "../ensurePool";
import { cleanupTestPoolData } from "./helpers/testDb";

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
    setLastIngestCompletedAt(null);
    const icsFixtures = await db.query.fixtures.findMany({
      where: eq(schema.fixtures.source, "ics"),
    });
    const icsFixtureIds = icsFixtures.map((f) => f.id);
    if (icsFixtureIds.length > 0) {
      const pools = await db.query.gamePools.findMany({
        where: inArray(schema.gamePools.fixtureId, icsFixtureIds),
      });
      for (const pool of pools) {
        await cleanupTestPoolData(db, pool.id, pool.fixtureId);
      }
      await db.delete(schema.possessionEvents).where(inArray(schema.possessionEvents.fixtureId, icsFixtureIds));
      await db.delete(schema.fixtures).where(eq(schema.fixtures.source, "ics"));
    }
  });

  it("handles ingest cooldown tracking accurately", () => {
    expect(getIngestCooldownSeconds()).toBeGreaterThanOrEqual(0);
    const initialCheck = checkIngestCooldown(1786900000);
    expect(initialCheck.allowed).toBe(true);
    expect(initialCheck.remainingSeconds).toBe(0);

    // Set last ingest at 1786900000
    setLastIngestCompletedAt(1786900000);

    // 100 seconds later -> cooldown still active
    const check1 = checkIngestCooldown(1786900100);
    expect(check1.allowed).toBe(false);
    expect(check1.remainingSeconds).toBe(200);

    // 350 seconds later -> cooldown expired
    const check2 = checkIngestCooldown(1786900350);
    expect(check2.allowed).toBe(true);
    expect(check2.remainingSeconds).toBe(0);
  });

  it("throws error for non-existent club", async () => {
    await expect(
      ingestClubFixtures(db, "non_existent_club")
    ).rejects.toThrow("Club non_existent_club not found");
  });

  it("parses ICS feed and inserts fixtures into database", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        etag: '"test-etag-1"',
        "last-modified": "Mon, 10 Aug 2026 12:00:00 GMT",
      }),
      text: async () => sampleIcs,
    } as Response);

    const result = await ingestClubFixtures(db, "excelsior");
    expect(result.clubSlug).toBe("excelsior");
    expect(result.totalParsed).toBe(4);
    expect(result.inserted).toBeGreaterThanOrEqual(1);
    expect(result.eTag).toBe('"test-etag-1"');

    const fixture = await db.query.fixtures.findFirst({
      where: eq(schema.fixtures.sourceUid, "64235e165487771765001@fixtur.es"),
    });
    expect(fixture).toBeDefined();
    expect(fixture?.opponent).toBe("NEC");
    expect(fixture?.status).toBe("scheduled");
    expect(fixture?.isHome).toBe(1);
    expect(fixture?.competition).toBe("Eredivisie");
  });

  it("supports HTTP 304 Not Modified conditional fetching", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 304,
      headers: new Headers({
        etag: '"cached-etag"',
      }),
      text: async () => "",
    } as unknown as Response);

    const result = await ingestClubFixtures(db, "excelsior", {
      eTag: '"cached-etag"',
      ifModifiedSince: "Mon, 10 Aug 2026 12:00:00 GMT",
    });

    expect(result.notModified).toBe(true);
    expect(result.totalParsed).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.eTag).toBe('"cached-etag"');
  });

  it("updates existing fixture when LAST-MODIFIED, venue, or opponent changes", async () => {
    // 1. Initial ingestion
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => sampleIcs,
    } as Response);

    await ingestClubFixtures(db, "excelsior");

    const fixtureId = "fix_excelsior_64235e165487771765001@fixtur.es";

    // 2. Change venue and last-modified
    const updatedIcs = sampleIcs
      .replace(
        "LOCATION:Van Donge & De Roo Stadion\\, Rotterdam\\, Netherlands",
        "LOCATION:Woudestein Stadium"
      )
      .replace(
        "LAST-MODIFIED:20260810T120000Z",
        "LAST-MODIFIED:20260815T160000Z"
      );

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => updatedIcs,
    } as Response);

    const result = await ingestClubFixtures(db, "excelsior");
    expect(result.updated).toBeGreaterThanOrEqual(1);

    const updatedFix = await db.query.fixtures.findFirst({
      where: eq(schema.fixtures.id, fixtureId),
    });
    expect(updatedFix?.venue).toBe("Woudestein Stadium");
    expect(updatedFix?.sourceLastModified).toBe(Math.floor(Date.UTC(2026, 7, 15, 16, 0, 0) / 1000));
  });

  it("handles disappeared fixtures by marking upcoming match cancelled via mutate()", async () => {
    // 1. Initial ingestion
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => sampleIcs,
    } as Response);

    await ingestClubFixtures(db, "excelsior");

    const disappearingFixtureId = "fix_excelsior_64235e165487771765002@fixtur.es"; // Feyenoord match
    const pool = await ensurePool(db, "group_goedvolk", disappearingFixtureId);

    // 2. Feed with Feyenoord match removed
    const lines = sampleIcs.split("\n");
    const filteredLines = [];
    let skipping = false;
    for (const line of lines) {
      if (line.includes("64235e165487771765002@fixtur.es")) {
        skipping = true;
      }
      if (!skipping) {
        filteredLines.push(line);
      }
      if (skipping && line.startsWith("END:VEVENT")) {
        skipping = false;
      }
    }
    const reducedIcs = filteredLines.join("\n");

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => reducedIcs,
    } as Response);

    const result = await ingestClubFixtures(db, "excelsior");
    expect(result.cancelled).toBe(1);

    const fix = await db.query.fixtures.findFirst({
      where: eq(schema.fixtures.id, disappearingFixtureId),
    });
    expect(fix?.status).toBe("cancelled");

    const cancelledPool = await db.query.gamePools.findFirst({
      where: eq(schema.gamePools.id, pool.id),
    });
    expect(cancelledPool?.status).toBe("cancelled");

    // Clean up
    await db.delete(schema.activityEvents).where(eq(schema.activityEvents.gamePoolId, pool.id));
    await db.delete(schema.poolVersionGuards).where(eq(schema.poolVersionGuards.gamePoolId, pool.id));
    await db.delete(schema.passGameStates).where(eq(schema.passGameStates.gamePoolId, pool.id));
    await db.delete(schema.gamePools).where(eq(schema.gamePools.id, pool.id));
  });

  it("updates existing fixture and triggers pool reschedule event when kickoff changes", async () => {
    // 1. Initial ingestion
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
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
      status: 200,
      headers: new Headers(),
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
