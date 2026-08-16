import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/schema";
import { ensurePool } from "../src/server/ensurePool";

async function main() {
  const scenario = process.argv[2] ?? "default";
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    persist: { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema });
  const now = Math.floor(Date.now() / 1000);
  const fixtureId = "fix_test_1";
  const poolId = "pool_group_goedvolk_fix_test_1";

  console.log("Cleaning up previous test pool state...");
  await db.delete(schema.activityEvents).where(eq(schema.activityEvents.gamePoolId, poolId));
  await db.delete(schema.poolVersionGuards).where(eq(schema.poolVersionGuards.gamePoolId, poolId));
  await db.delete(schema.passGameStates).where(eq(schema.passGameStates.gamePoolId, poolId));
  await db.delete(schema.queueEntries).where(eq(schema.queueEntries.gamePoolId, poolId));
  await db.delete(schema.gamePools).where(eq(schema.gamePools.id, poolId));
  await db.delete(schema.fixtures).where(eq(schema.fixtures.id, fixtureId));

  console.log("Setting up fixture for test...");
  await db
    .insert(schema.fixtures)
    .values({
      id: fixtureId,
      clubId: "club_excelsior",
      seasonId: "season_excelsior_2026_27",
      source: "manual",
      sourceUid: "test_uid_1",
      sourceSequence: 0,
      competition: "Eredivisie",
      opponent: "NEC",
      isHome: 1,
      kickoffAt: now + 7 * 86400,
      venue: "Van Donge & De Roo Stadion",
      status: "scheduled",
      rawSummary: "Excelsior - NEC",
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

  console.log("Ensuring game pool...");
  const pool = await ensurePool(db, "group_goedvolk", fixtureId);

  if (scenario === "giveback" || scenario === "scenario3" || scenario === "scenario-3") {
    console.log("Seeding giveback scenario (pass_goedvolk_1 assigned to member_goedvolk_daan)...");
    const entryId = 1;
    const passId = "pass_goedvolk_1";
    const daanId = "member_goedvolk_daan";
    const samId = "member_goedvolk_sam";

    await db.insert(schema.queueEntries).values({
      id: entryId,
      gamePoolId: poolId,
      memberId: daanId,
      kind: "self",
      guestName: null,
      status: "assigned",
      assignedPassId: passId,
      assignedAt: now,
      createdAt: now,
    });

    await db
      .update(schema.passGameStates)
      .set({
        status: "assigned",
        indicatedByMemberId: samId,
        indicatedAt: now,
        releasedAt: now,
        claimantEntryId: entryId,
        assignedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_${passId}`));

    await db
      .update(schema.gamePools)
      .set({
        version: 2,
        updatedAt: now,
      })
      .where(eq(schema.gamePools.id, poolId));

    await db.insert(schema.poolVersionGuards).values([
      { gamePoolId: poolId, version: 1, createdAt: now },
      { gamePoolId: poolId, version: 2, createdAt: now },
    ]);

    await db.insert(schema.activityEvents).values([
      {
        id: `evt_init_join_${poolId}_${entryId}`,
        gamePoolId: poolId,
        passId: null,
        actorMemberId: daanId,
        type: "queue.joined",
        payloadJson: JSON.stringify({ entryId, memberId: daanId, kind: "self" }),
        idempotencyKey: `init-join-${entryId}`,
        createdAt: now,
      },
      {
        id: `evt_init_rel_${poolId}_${passId}`,
        gamePoolId: poolId,
        passId: passId,
        actorMemberId: samId,
        type: "pass.released",
        payloadJson: JSON.stringify({ passId, releasedBy: samId }),
        idempotencyKey: `init-rel-${passId}`,
        createdAt: now,
      },
      {
        id: `evt_init_assign_${poolId}_${passId}`,
        gamePoolId: poolId,
        passId: passId,
        actorMemberId: samId,
        type: "pass.assigned",
        payloadJson: JSON.stringify({ passId, claimantEntryId: entryId }),
        idempotencyKey: null,
        createdAt: now,
      },
    ]);
  }

  console.log(`Test game pool ready: ${pool.id} (scenario: ${scenario})`);

  await proxy.dispose();
}

main().catch((err) => {
  console.error("Setup test pool failed:", err);
  process.exit(1);
});
