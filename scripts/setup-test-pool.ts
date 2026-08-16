import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/server/schema";
import { ensurePool } from "../src/server/ensurePool";

async function main() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    persist: { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema });
  const now = Math.floor(Date.now() / 1000);

  console.log("Cleaning up previous test pool state...");
  await db.delete(schema.activityEvents);
  await db.delete(schema.poolVersionGuards);
  await db.delete(schema.passGameStates);
  await db.delete(schema.queueEntries);
  await db.delete(schema.gamePools);

  console.log("Setting up fixture for test...");
  const fixtureId = "fix_test_1";
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
  console.log(`Test game pool ready: ${pool.id}`);

  await proxy.dispose();
}

main().catch((err) => {
  console.error("Setup test pool failed:", err);
  process.exit(1);
});
