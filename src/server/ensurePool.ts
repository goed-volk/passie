import { and, asc, eq, gte } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";
import { computeIndicationDeadline } from "../domain/deadlines";

export async function findNextHomeFixture(db: DbClient, clubId?: string) {
  const now = Math.floor(Date.now() / 1000);
  // Next home game = smallest kickoff_at >= now - 3h with status='scheduled' and is_home=1
  const threeHoursAgo = now - 3 * 3600;

  const conditions = [
    eq(schema.fixtures.status, "scheduled"),
    eq(schema.fixtures.isHome, 1),
    gte(schema.fixtures.kickoffAt, threeHoursAgo),
  ];

  if (clubId) {
    conditions.push(eq(schema.fixtures.clubId, clubId));
  }

  const fixture = await db.query.fixtures.findFirst({
    where: and(...conditions),
    orderBy: [asc(schema.fixtures.kickoffAt)],
  });

  return fixture ?? null;
}

export async function ensurePool(
  db: DbClient,
  groupId: string,
  fixtureId: string
) {
  const now = Math.floor(Date.now() / 1000);

  // 1. Check if pool already exists
  const existingPool = await db.query.gamePools.findFirst({
    where: and(
      eq(schema.gamePools.groupId, groupId),
      eq(schema.gamePools.fixtureId, fixtureId)
    ),
  });

  if (existingPool) {
    return existingPool;
  }

  // 2. Fetch fixture to compute indication deadline
  const fixture = await db.query.fixtures.findFirst({
    where: eq(schema.fixtures.id, fixtureId),
  });

  if (!fixture) {
    throw new Error(`Fixture ${fixtureId} not found`);
  }

  const indicationDeadlineAt = computeIndicationDeadline(fixture.kickoffAt);
  const poolId = `pool_${groupId}_${fixtureId}`;

  // 3. Fetch active passes for group
  const groupPasses = await db.query.passes.findMany({
    where: and(eq(schema.passes.groupId, groupId), eq(schema.passes.isActive, 1)),
    orderBy: [asc(schema.passes.sortOrder)],
  });

  // 4. Create pool, pass_game_states, initial version guard, and event in atomic batch
  const poolInsert = db
    .insert(schema.gamePools)
    .values({
      id: poolId,
      groupId,
      fixtureId,
      status: "open",
      indicationDeadlineAt,
      version: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const initialGuardInsert = db
    .insert(schema.poolVersionGuards)
    .values({
      gamePoolId: poolId,
      version: 0,
      createdAt: now,
    })
    .onConflictDoNothing();

  const passStateInserts = groupPasses.map((pass) =>
    db
      .insert(schema.passGameStates)
      .values({
        id: `pgs_${poolId}_${pass.id}`,
        gamePoolId: poolId,
        passId: pass.id,
        status: "unindicated",
        indicatedByMemberId: null,
        indicatedAt: null,
        releasedAt: null,
        claimantEntryId: null,
        assignedAt: null,
        updatedAt: now,
      })
      .onConflictDoNothing()
  );

  const eventInsert = db
    .insert(schema.activityEvents)
    .values({
      id: `evt_pool_opened_${poolId}`,
      gamePoolId: poolId,
      passId: null,
      actorMemberId: null,
      type: "pool.opened",
      payloadJson: JSON.stringify({
        groupId,
        fixtureId,
        kickoffAt: fixture.kickoffAt,
        indicationDeadlineAt,
      }),
      createdAt: now,
    })
    .onConflictDoNothing();

  try {
    await db.batch([poolInsert, initialGuardInsert, ...passStateInserts, eventInsert] as any);
  } catch (err) {
    // In case concurrent creation occurred, swallow benign conflict and load existing pool
    console.warn("ensurePool batch execution notice:", err);
  }

  // Return the created or existing pool
  const pool = await db.query.gamePools.findFirst({
    where: and(
      eq(schema.gamePools.groupId, groupId),
      eq(schema.gamePools.fixtureId, fixtureId)
    ),
  });

  if (!pool) {
    throw new Error(`Failed to create or find game pool for fixture ${fixtureId}`);
  }

  return pool;
}
