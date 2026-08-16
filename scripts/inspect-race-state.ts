import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/server/schema";
import { eq, asc } from "drizzle-orm";

async function main() {
  const poolId = process.argv[2] ?? "pool_group_goedvolk_fix_test_1";

  // Suppress wrangler stdout banners by redirecting or extracting JSON
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
          status: q.status,
          assignedPassId: q.assignedPassId,
        })),
        passStates: passStates.map((p) => ({
          passId: p.passId,
          status: p.status,
          claimantEntryId: p.claimantEntryId,
        })),
        events: events.map((e) => ({
          type: e.type,
          idempotencyKey: e.idempotencyKey,
          actorMemberId: e.actorMemberId,
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

