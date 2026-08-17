import { getPlatformProxy } from "./proxy";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/schema";
import { ensurePool } from "../src/server/ensurePool";
import { computeIndicationDeadline } from "../src/domain/deadlines";

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

  console.log(`Cleaning up previous test pool state for scenario '${scenario}'...`);
  await db.delete(schema.activityEvents).where(eq(schema.activityEvents.gamePoolId, poolId));
  await db.delete(schema.poolVersionGuards).where(eq(schema.poolVersionGuards.gamePoolId, poolId));
  await db.delete(schema.passGameStates).where(eq(schema.passGameStates.gamePoolId, poolId));
  await db.delete(schema.queueEntries).where(eq(schema.queueEntries.gamePoolId, poolId));
  await db.delete(schema.gamePools).where(eq(schema.gamePools.id, poolId));
  await db.delete(schema.fixtures).where(eq(schema.fixtures.id, fixtureId));

  let kickoffAt = now + 7 * 86400; // default: 7 days out
  let fixtureStatus: "scheduled" | "cancelled" = "scheduled";

  if (scenario === "deadline-soon") {
    // Deadline lands in ~90 minutes (kickoff is 24h + 90m from now)
    kickoffAt = now + 24 * 3600 + 90 * 60;
  } else if (scenario === "deadline-passed") {
    // Kickoff is 12h from now -> deadline was 12h ago (now - 12h)
    kickoffAt = now + 12 * 3600;
  } else if (scenario === "post-match") {
    // Kickoff was 2h ago (within -3h window for findNextHomeFixture)
    kickoffAt = now - 2 * 3600;
  } else if (scenario === "cancelled") {
    kickoffAt = now + 5 * 86400;
    fixtureStatus = "cancelled";
  }

  console.log(`Setting up fixture for test (kickoff: ${kickoffAt}, status: ${fixtureStatus})...`);
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
      kickoffAt,
      venue: "Van Donge & De Roo Stadion",
      status: fixtureStatus,
      rawSummary: "Excelsior - NEC",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.fixtures.clubId, schema.fixtures.source, schema.fixtures.sourceUid],
      set: {
        kickoffAt,
        status: fixtureStatus,
        updatedAt: now,
      },
    });

  console.log("Ensuring game pool...");
  const pool = await ensurePool(db, "group_goedvolk", fixtureId);

  // Scenario-specific state setup
  if (scenario === "deadline-soon") {
    console.log("Seeding 'deadline-soon' scenario (mixed indications, ~90m deadline)...");
    const samId = "member_goedvolk_sam";
    const ilseId = "member_goedvolk_ilse";
    const milanId = "member_goedvolk_milan";
    const daanId = "member_goedvolk_daan";

    // Pass 1: Kept by Sam
    await db
      .update(schema.passGameStates)
      .set({
        status: "kept",
        indicatedByMemberId: samId,
        indicatedAt: now - 3600,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_1`));

    // Pass 4: Kept by Daan
    await db
      .update(schema.passGameStates)
      .set({
        status: "kept",
        indicatedByMemberId: daanId,
        indicatedAt: now - 1800,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_4`));

    // Queue entry 1: Milan joins and gets Pass 2 (released by Ilse)
    await db.insert(schema.queueEntries).values({
      id: 1,
      gamePoolId: poolId,
      memberId: milanId,
      kind: "self",
      guestName: null,
      status: "assigned",
      assignedPassId: "pass_goedvolk_2",
      assignedAt: now - 900,
      createdAt: now - 1200,
    });

    await db
      .update(schema.passGameStates)
      .set({
        status: "assigned",
        indicatedByMemberId: ilseId,
        indicatedAt: now - 1000,
        releasedAt: now - 1000,
        claimantEntryId: 1,
        assignedAt: now - 900,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_2`));

    await db
      .update(schema.gamePools)
      .set({ version: 2, updatedAt: now })
      .where(eq(schema.gamePools.id, poolId));

    await db.insert(schema.poolVersionGuards).values([
      { gamePoolId: poolId, version: 1, createdAt: now },
      { gamePoolId: poolId, version: 2, createdAt: now },
    ]);
  } else if (scenario === "deadline-passed") {
    console.log("Seeding 'deadline-passed' scenario (deadline in past, unindicated owned passes)...");
    const ilseId = "member_goedvolk_ilse";
    const daanId = "member_goedvolk_daan";

    // Pass 2: Kept by Ilse
    await db
      .update(schema.passGameStates)
      .set({
        status: "kept",
        indicatedByMemberId: ilseId,
        indicatedAt: now - 86400,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_2`));

    // Pass 4: Kept by Daan
    await db
      .update(schema.passGameStates)
      .set({
        status: "kept",
        indicatedByMemberId: daanId,
        indicatedAt: now - 86400,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_4`));

    // Pass 1 (Sam) and Pass 3 (Bram) remain 'unindicated' to trigger deadline-passed alert
  } else if (scenario === "queue-waiting") {
    console.log("Seeding 'queue-waiting' scenario (all passes kept, 3 waiting queue entries)...");
    // Mark all passes as kept by their primary owner/holder
    const passes = await db.query.passes.findMany({
      where: eq(schema.passes.groupId, "group_goedvolk"),
    });

    for (const p of passes) {
      await db
        .update(schema.passGameStates)
        .set({
          status: "kept",
          indicatedByMemberId: p.holderMemberId ?? "member_goedvolk_sam",
          indicatedAt: now - 3600,
          updatedAt: now,
        })
        .where(eq(schema.passGameStates.id, `pgs_${poolId}_${p.id}`));
    }

    // Insert 3 waiting queue entries (1 guest)
    await db.insert(schema.queueEntries).values([
      {
        id: 1,
        gamePoolId: poolId,
        memberId: "member_goedvolk_milan",
        kind: "self",
        guestName: null,
        status: "waiting",
        assignedPassId: null,
        assignedAt: null,
        createdAt: now - 1800,
      },
      {
        id: 2,
        gamePoolId: poolId,
        memberId: "member_goedvolk_nina",
        kind: "guest",
        guestName: "Opa Henk",
        status: "waiting",
        assignedPassId: null,
        assignedAt: null,
        createdAt: now - 1200,
      },
      {
        id: 3,
        gamePoolId: poolId,
        memberId: "member_goedvolk_olaf",
        kind: "self",
        guestName: null,
        status: "waiting",
        assignedPassId: null,
        assignedAt: null,
        createdAt: now - 600,
      },
    ]);

    await db
      .update(schema.gamePools)
      .set({ version: 3, updatedAt: now })
      .where(eq(schema.gamePools.id, poolId));

    await db.insert(schema.poolVersionGuards).values([
      { gamePoolId: poolId, version: 1, createdAt: now },
      { gamePoolId: poolId, version: 2, createdAt: now },
      { gamePoolId: poolId, version: 3, createdAt: now },
    ]);
  } else if (scenario === "giveback" || scenario === "scenario3" || scenario === "scenario-3") {
    console.log("Seeding 'giveback' scenario (pass_goedvolk_1 assigned to member_goedvolk_daan)...");
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
  } else if (scenario === "assigned-and-reclaimable") {
    console.log("Seeding 'assigned-and-reclaimable' scenario (reclaim & giveback actions observable)...");
    const samId = "member_goedvolk_sam";
    const ilseId = "member_goedvolk_ilse";
    const daanId = "member_goedvolk_daan";
    const evaId = "member_goedvolk_eva";
    const olafId = "member_goedvolk_olaf";

    // Queue entry 1: Daan assigned Pass 1 (released by Sam)
    // Queue entry 2: Eva assigned Pass 2 (released by Ilse/Noor)
    // Queue entry 3: Olaf waiting (self)
    await db.insert(schema.queueEntries).values([
      {
        id: 1,
        gamePoolId: poolId,
        memberId: daanId,
        kind: "self",
        guestName: null,
        status: "assigned",
        assignedPassId: "pass_goedvolk_1",
        assignedAt: now - 3000,
        createdAt: now - 3600,
      },
      {
        id: 2,
        gamePoolId: poolId,
        memberId: evaId,
        kind: "self",
        guestName: null,
        status: "assigned",
        assignedPassId: "pass_goedvolk_2",
        assignedAt: now - 2000,
        createdAt: now - 2500,
      },
      {
        id: 3,
        gamePoolId: poolId,
        memberId: olafId,
        kind: "self",
        guestName: null,
        status: "waiting",
        assignedPassId: null,
        assignedAt: null,
        createdAt: now - 1000,
      },
    ]);

    await db
      .update(schema.passGameStates)
      .set({
        status: "assigned",
        indicatedByMemberId: samId,
        indicatedAt: now - 3500,
        releasedAt: now - 3500,
        claimantEntryId: 1,
        assignedAt: now - 3000,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_1`));

    await db
      .update(schema.passGameStates)
      .set({
        status: "assigned",
        indicatedByMemberId: ilseId,
        indicatedAt: now - 2400,
        releasedAt: now - 2400,
        claimantEntryId: 2,
        assignedAt: now - 2000,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_2`));

    // Pass 3 (Bram): Kept by Bram
    await db
      .update(schema.passGameStates)
      .set({
        status: "kept",
        indicatedByMemberId: "member_goedvolk_bram",
        indicatedAt: now - 1500,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_3`));

    await db
      .update(schema.gamePools)
      .set({
        version: 3,
        updatedAt: now,
      })
      .where(eq(schema.gamePools.id, poolId));

    await db.insert(schema.poolVersionGuards).values([
      { gamePoolId: poolId, version: 1, createdAt: now },
      { gamePoolId: poolId, version: 2, createdAt: now },
      { gamePoolId: poolId, version: 3, createdAt: now },
    ]);

    await db.insert(schema.activityEvents).values([
      {
        id: `evt_init_join_${poolId}_1`,
        gamePoolId: poolId,
        passId: null,
        actorMemberId: daanId,
        type: "queue.joined",
        payloadJson: JSON.stringify({ entryId: 1, memberId: daanId, kind: "self" }),
        idempotencyKey: `init-join-1`,
        createdAt: now - 3600,
      },
      {
        id: `evt_init_rel_${poolId}_pass_goedvolk_1`,
        gamePoolId: poolId,
        passId: "pass_goedvolk_1",
        actorMemberId: samId,
        type: "pass.released",
        payloadJson: JSON.stringify({ passId: "pass_goedvolk_1", releasedBy: samId }),
        idempotencyKey: `init-rel-pass_goedvolk_1`,
        createdAt: now - 3500,
      },
      {
        id: `evt_init_assign_${poolId}_pass_goedvolk_1`,
        gamePoolId: poolId,
        passId: "pass_goedvolk_1",
        actorMemberId: samId,
        type: "pass.assigned",
        payloadJson: JSON.stringify({ passId: "pass_goedvolk_1", claimantEntryId: 1 }),
        idempotencyKey: null,
        createdAt: now - 3000,
      },
      {
        id: `evt_init_join_${poolId}_2`,
        gamePoolId: poolId,
        passId: null,
        actorMemberId: evaId,
        type: "queue.joined",
        payloadJson: JSON.stringify({ entryId: 2, memberId: evaId, kind: "self" }),
        idempotencyKey: `init-join-2`,
        createdAt: now - 2500,
      },
      {
        id: `evt_init_rel_${poolId}_pass_goedvolk_2`,
        gamePoolId: poolId,
        passId: "pass_goedvolk_2",
        actorMemberId: ilseId,
        type: "pass.released",
        payloadJson: JSON.stringify({ passId: "pass_goedvolk_2", releasedBy: ilseId }),
        idempotencyKey: `init-rel-pass_goedvolk_2`,
        createdAt: now - 2400,
      },
      {
        id: `evt_init_assign_${poolId}_pass_goedvolk_2`,
        gamePoolId: poolId,
        passId: "pass_goedvolk_2",
        actorMemberId: ilseId,
        type: "pass.assigned",
        payloadJson: JSON.stringify({ passId: "pass_goedvolk_2", claimantEntryId: 2 }),
        idempotencyKey: null,
        createdAt: now - 2000,
      },
    ]);
  } else if (scenario === "post-match") {
    console.log("Seeding 'post-match' scenario (kickoff in past, match concluded/active)...");
    const samId = "member_goedvolk_sam";
    const ilseId = "member_goedvolk_ilse";
    const daanId = "member_goedvolk_daan";

    await db.insert(schema.queueEntries).values({
      id: 1,
      gamePoolId: poolId,
      memberId: daanId,
      kind: "self",
      guestName: null,
      status: "assigned",
      assignedPassId: "pass_goedvolk_2",
      assignedAt: now - 80000,
      createdAt: now - 85000,
    });

    await db
      .update(schema.passGameStates)
      .set({
        status: "kept",
        indicatedByMemberId: samId,
        indicatedAt: now - 86400,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_1`));

    await db
      .update(schema.passGameStates)
      .set({
        status: "assigned",
        indicatedByMemberId: ilseId,
        indicatedAt: now - 86400,
        releasedAt: now - 86400,
        claimantEntryId: 1,
        assignedAt: now - 80000,
        updatedAt: now,
      })
      .where(eq(schema.passGameStates.id, `pgs_${poolId}_pass_goedvolk_2`));
  } else if (scenario === "cancelled") {
    console.log("Seeding 'cancelled' scenario (fixture and pool cancelled)...");
    await db
      .update(schema.gamePools)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(schema.gamePools.id, poolId));
  }

  console.log(`Test game pool ready: ${pool.id} (scenario: ${scenario})`);
  await proxy.dispose();
}

main().catch((err) => {
  console.error("Setup test pool failed:", err);
  process.exit(1);
});
