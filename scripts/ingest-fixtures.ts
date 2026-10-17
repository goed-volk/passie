import { getPlatformProxy } from "./proxy";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/server/schema";
import { ingestClubFixtures } from "../src/server/ingest";

async function main() {
  const args = process.argv.slice(2);
  const isRemote = args.includes("--remote");
  let env = "development";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--env=")) {
      env = arg.slice(6);
    } else if (arg === "--env" && args[i + 1]) {
      env = args[i + 1]!;
    }
  }

  const isStaging = env === "staging";

  if (isRemote && env === "production") {
    console.error("Error: Direct manual script ingestion against production is disabled. Use cron trigger or /api/fixtures/refresh.");
    process.exit(1);
  }

  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    environment: isStaging ? "staging" : undefined,
    persist: isRemote ? false : { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema });
  console.log(`Ingesting fixtures for Excelsior (${env}${isRemote ? " remote" : ""})...`);

  const result = await ingestClubFixtures(db, "excelsior");
  console.log("Ingestion result:", result);

  await proxy.dispose();
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
