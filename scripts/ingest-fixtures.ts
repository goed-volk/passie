import { getPlatformProxy } from "./proxy";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/server/schema";
import { ingestClubFixtures } from "../src/server/ingest";

async function main() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    persist: { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema });
  console.log("Ingesting fixtures for Excelsior...");

  const result = await ingestClubFixtures(db, "excelsior");
  console.log("Ingestion result:", result);

  await proxy.dispose();
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
