import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/schema";

export async function cleanupTestPool(
  customPoolId?: string,
  customFixtureId?: string
) {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    persist: { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema });
  const poolId = customPoolId ?? process.argv[2] ?? "pool_group_goedvolk_fix_test_1";
  const fixtureId = customFixtureId ?? process.argv[3] ?? "fix_test_1";

  await db.delete(schema.activityEvents).where(eq(schema.activityEvents.gamePoolId, poolId));
  await db.delete(schema.poolVersionGuards).where(eq(schema.poolVersionGuards.gamePoolId, poolId));
  await db.delete(schema.passGameStates).where(eq(schema.passGameStates.gamePoolId, poolId));
  await db.delete(schema.queueEntries).where(eq(schema.queueEntries.gamePoolId, poolId));
  await db.delete(schema.gamePools).where(eq(schema.gamePools.id, poolId));
  await db.delete(schema.fixtures).where(eq(schema.fixtures.id, fixtureId));

  await proxy.dispose();
}

cleanupTestPool().catch((err) => {
  console.error("Cleanup test pool failed:", err);
  process.exit(1);
});
