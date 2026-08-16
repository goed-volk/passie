import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import type { DbClient } from "../../db";
import { ensurePool } from "../../ensurePool";

export async function createTestDb() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    persist: { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema }) as DbClient;
  return { proxy, db };
}

export async function cleanupTestPoolData(
  db: DbClient,
  poolId: string,
  fixtureId: string
) {
  await db.delete(schema.activityEvents).where(eq(schema.activityEvents.gamePoolId, poolId));
  await db.delete(schema.poolVersionGuards).where(eq(schema.poolVersionGuards.gamePoolId, poolId));
  await db.delete(schema.passGameStates).where(eq(schema.passGameStates.gamePoolId, poolId));
  await db.delete(schema.queueEntries).where(eq(schema.queueEntries.gamePoolId, poolId));
  await db.delete(schema.gamePools).where(eq(schema.gamePools.id, poolId));
  await db.delete(schema.fixtures).where(eq(schema.fixtures.id, fixtureId));
}

export async function setupIsolatedTestPool(
  db: DbClient,
  poolId: string,
  fixtureId: string,
  groupId = "group_goedvolk"
) {
  const now = Math.floor(Date.now() / 1000);

  await cleanupTestPoolData(db, poolId, fixtureId);

  await db
    .insert(schema.fixtures)
    .values({
      id: fixtureId,
      clubId: "club_excelsior",
      seasonId: "season_excelsior_2026_27",
      source: "manual",
      sourceUid: `uid_${fixtureId}`,
      sourceSequence: 0,
      competition: "Eredivisie",
      opponent: "Test FC",
      isHome: 1,
      kickoffAt: now + 7 * 86400,
      venue: "Van Donge & De Roo Stadion",
      status: "scheduled",
      rawSummary: "Excelsior - Test FC",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.fixtures.clubId, schema.fixtures.source, schema.fixtures.sourceUid],
      set: {
        kickoffAt: now + 7 * 86400,
        status: "scheduled",
      },
    });

  const pool = await ensurePool(db, groupId, fixtureId);
  return pool;
}
