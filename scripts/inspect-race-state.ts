import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/server/schema";
import { eq, asc, inArray } from "drizzle-orm";

async function main() {
  const poolId = process.argv[2] ?? "pool_group_goedvolk_fix_test_1";

  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    persist: { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema });

  const pool = await db.query.gamePools.findFirst({
    where: eq(schema.gamePools.id, poolId),
  });

  const queue = await db.query.queueEntries.findMany({
    where: eq(schema.queueEntries.gamePoolId, poolId),
    orderBy: [asc(schema.queueEntries.id)],
  });

  const passStates = await db.query.passGameStates.findMany({
    where: eq(schema.passGameStates.gamePoolId, poolId),
  });

  const passIds = passStates.map((p) => p.passId);
  const passesList =
    passIds.length > 0
      ? await db.query.passes.findMany({
          where: inArray(schema.passes.id, passIds),
        })
      : [];

  const passSortOrderMap = new Map(passesList.map((p) => [p.id, p.sortOrder]));

  const events = await db.query.activityEvents.findMany({
    where: eq(schema.activityEvents.gamePoolId, poolId),
    orderBy: [asc(schema.activityEvents.createdAt)],
  });

  const guards = await db.query.poolVersionGuards.findMany({
    where: eq(schema.poolVersionGuards.gamePoolId, poolId),
    orderBy: [asc(schema.poolVersionGuards.version)],
  });

  process.stdout.write(
    "__STATE_START__" +
      JSON.stringify({
        version: pool?.version,
        guardsCount: guards.length,
        guardVersions: guards.map((g) => g.version),
        queue: queue.map((q) => ({
          id: q.id,
          memberId: q.memberId,
          kind: q.kind,
          guestName: q.guestName,
          status: q.status,
          assignedPassId: q.assignedPassId,
          createdAt: q.createdAt,
        })),
        passStates: passStates
          .map((p) => ({
            passId: p.passId,
            sortOrder: passSortOrderMap.get(p.passId) ?? 0,
            status: p.status,
            claimantEntryId: p.claimantEntryId,
            indicatedByMemberId: p.indicatedByMemberId,
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder),
        events: events.map((e) => ({
          id: e.id,
          type: e.type,
          passId: e.passId,
          actorMemberId: e.actorMemberId,
          idempotencyKey: e.idempotencyKey,
          payloadJson: e.payloadJson,
          createdAt: e.createdAt,
        })),
      }) +
      "__STATE_END__\n"
  );

  await proxy.dispose();
}

main().catch((err) => {
  console.error("Inspect error:", err);
  process.exit(1);
});

