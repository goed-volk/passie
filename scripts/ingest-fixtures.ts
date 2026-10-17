import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { getPlatformProxy } from "./proxy";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/server/schema";
import { ingestClubFixtures } from "../src/server/ingest";
import { parseIcsEvents } from "../src/server/ics";

export function generateFixturesSql(
  fixtures: ReturnType<typeof parseIcsEvents>,
  clubId = "club_excelsior",
  seasonId = "season_excelsior_2026_27",
  now = Math.floor(Date.now() / 1000)
): string {
  const sqlEscape = (val: string | null | undefined): string => {
    if (val === null || val === undefined) return "NULL";
    return `'${val.replace(/'/g, "''")}'`;
  };

  const sevenDaysAgo = now - 7 * 86400;
  const statements: string[] = [];

  for (const fix of fixtures) {
    if (fix.kickoffAt < sevenDaysAgo) continue;

    const fixtureId = `fix_excelsior_${fix.uid}`;
    const competition = fix.competition ?? "Eredivisie";
    const lastModifiedVal = fix.lastModified != null ? fix.lastModified : "NULL";

    statements.push(`
INSERT INTO fixtures (
  id, club_id, season_id, source, source_uid, source_sequence,
  source_last_modified, competition, opponent, is_home,
  kickoff_at, venue, status, raw_summary, created_at, updated_at
)
VALUES (
  ${sqlEscape(fixtureId)},
  ${sqlEscape(clubId)},
  ${sqlEscape(seasonId)},
  'ics',
  ${sqlEscape(fix.uid)},
  ${fix.sequence},
  ${lastModifiedVal},
  ${sqlEscape(competition)},
  ${sqlEscape(fix.opponent)},
  1,
  ${fix.kickoffAt},
  ${sqlEscape(fix.venue)},
  ${sqlEscape(fix.status)},
  ${sqlEscape(fix.rawSummary)},
  ${now},
  ${now}
)
ON CONFLICT(club_id, source, source_uid) DO UPDATE SET
  source_sequence = excluded.source_sequence,
  source_last_modified = excluded.source_last_modified,
  competition = excluded.competition,
  opponent = excluded.opponent,
  kickoff_at = excluded.kickoff_at,
  venue = excluded.venue,
  status = excluded.status,
  raw_summary = excluded.raw_summary,
  updated_at = excluded.updated_at;
    `.trim());
  }

  return statements.join("\n\n");
}

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

  if (isRemote) {
    if (!env || env === "production") {
      console.error(
        "Error: Direct manual script ingestion against production is disabled. Use cron trigger or /api/fixtures/refresh."
      );
      process.exit(1);
    }

    if (env !== "staging") {
      console.error(`Error: Remote ingestion is only permitted for staging environment, got '${env}'.`);
      process.exit(1);
    }

    let stagingDbName = "passie-staging-db";
    let stagingDbId = "1c936aac-181c-47dc-98c2-6f6d64416595";
    try {
      const wranglerConfigPath = path.resolve(process.cwd(), "wrangler.jsonc");
      if (fs.existsSync(wranglerConfigPath)) {
        const content = fs.readFileSync(wranglerConfigPath, "utf-8");
        const parsed = JSON.parse(content.replace(/\/\/.*$/gm, ""));
        const stagingD1 = parsed?.env?.staging?.d1_databases?.[0];
        if (stagingD1?.database_name) stagingDbName = stagingD1.database_name;
        if (stagingD1?.database_id) stagingDbId = stagingD1.database_id;
      }
    } catch {
      // Fallback to defaults
    }

    if (stagingDbName === "passie" || stagingDbId === "176bd801-9d6f-4d7e-8306-83ea0a0be157") {
      console.error("Safety assertion failed: Database matches production database.");
      process.exit(1);
    }

    console.log(`Fetching live ICS feed for remote staging ingestion on '${stagingDbName}'...`);
    const icsUrl = "https://ics.fixtur.es/v2/home/excelsior.ics";
    const resp = await fetch(icsUrl);
    if (!resp.ok) {
      throw new Error(`Failed to fetch ICS feed: HTTP ${resp.status}`);
    }
    const rawIcs = await resp.text();
    const fixtures = parseIcsEvents(rawIcs, "Europe/Amsterdam");
    const sql = generateFixturesSql(fixtures);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "passie-staging-ingest-"));
    const tmpSqlFile = path.join(tmpDir, "ingest.sql");
    try {
      fs.writeFileSync(tmpSqlFile, sql, "utf-8");
      console.log(`Executing remote fixture ingestion on '${stagingDbName}' via wrangler d1 execute...`);
      execFileSync(
        "pnpm",
        ["exec", "wrangler", "d1", "execute", stagingDbName, "--env", "staging", "--remote", `--file=${tmpSqlFile}`, "-y"],
        { stdio: "inherit" }
      );
      console.log("Remote staging fixture ingestion complete!");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    return;
  }

  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    environment: isStaging ? "staging" : undefined,
    persist: { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema });
  console.log(`Ingesting fixtures for Excelsior (${env})...`);

  const result = await ingestClubFixtures(db, "excelsior");
  console.log("Ingestion result:", result);

  await proxy.dispose();
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
