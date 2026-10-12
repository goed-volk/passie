import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GET, handleRefreshPost } from "@/app/api/fixtures/refresh/route";
import { setLastIngestCompletedAt } from "@/server/ingest";
import { createTestDb } from "@/server/__tests__/helpers/testDb";
import type { DbClient } from "@/server/db";
import * as schema from "@/server/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";
import { cleanupTestPoolData } from "@/server/__tests__/helpers/testDb";

const mockGetActingMember = vi.fn();
vi.mock("@/server/actingMember", () => ({
  getActingMember: () => mockGetActingMember(),
}));

describe("/api/fixtures/refresh route tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;

  const sampleIcs = fs.readFileSync(
    path.resolve(__dirname, "../../../server/__tests__/fixtures/excelsior-home.ics"),
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
    mockGetActingMember.mockReset();
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

  it("GET returns current cooldown status", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok: boolean; allowed: boolean; remainingSeconds: number };
    expect(data.ok).toBe(true);
    expect(data.allowed).toBe(true);
    expect(data.remainingSeconds).toBe(0);
  });

  it("POST returns 401 when unauthenticated", async () => {
    mockGetActingMember.mockResolvedValue(null);

    const res = await handleRefreshPost(proxy.env.DB);
    expect(res.status).toBe(401);
    const data = (await res.json()) as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toBe("UNAUTHORIZED");
  });

  it("POST triggers manual fetch and returns 200 on first call, 429 on immediate second call when authenticated", async () => {
    mockGetActingMember.mockResolvedValue({
      id: "member_goedvolk_sam",
      groupId: "group_goedvolk",
      displayName: "Sam",
      slug: "sam",
      initials: "S",
      avatarColor: "#E30613",
    });

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => sampleIcs,
    } as Response);

    // First call with test DB proxy
    const res1 = await handleRefreshPost(proxy.env.DB);
    expect(res1.status).toBe(200);
    const data1 = (await res1.json()) as { ok: boolean; result: { inserted: number } };
    expect(data1.ok).toBe(true);
    expect(data1.result.inserted).toBeGreaterThanOrEqual(1);

    // Second immediate call -> 429 Cooldown Active
    const res2 = await handleRefreshPost(proxy.env.DB);
    expect(res2.status).toBe(429);
    const data2 = (await res2.json()) as { ok: boolean; error: string; remainingSeconds: number };
    expect(data2.ok).toBe(false);
    expect(data2.error).toBe("COOLDOWN_ACTIVE");
    expect(data2.remainingSeconds).toBeGreaterThan(0);
  });
});
