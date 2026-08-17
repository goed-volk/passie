import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getPlatformProxy } from "./proxy";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/server/schema";

export interface SeedClub {
  slug: string;
  name: string;
  shortName: string;
  city: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorOnPrimary: string;
  logoUrl?: string | null;
  icsHomeFeedUrl: string;
}

export interface SeedSeason {
  label: string;
  startsOn: string;
  endsOn: string;
}

export interface SeedGroup {
  slug: string;
  name: string;
  timezone?: string;
}

export interface SeedMember {
  slug: string;
  displayName: string;
  initials?: string;
  avatarColor: string;
  sortOrder?: number;
}

export interface SeedPass {
  label: string;
  seatInfo?: string | null;
  owners: string[];
  holder: string;
  sortOrder?: number;
}

export interface SeedData {
  club: SeedClub;
  season: SeedSeason;
  group: SeedGroup;
  members: SeedMember[];
  passes: SeedPass[];
}

export function generateSeedSql(seed: SeedData): string {
  const sqlEscape = (val: string | null | undefined): string => {
    if (val === null || val === undefined) return "NULL";
    return `'${val.replace(/'/g, "''")}'`;
  };

  const now = Math.floor(Date.now() / 1000);
  const statements: string[] = [];

  const clubId = `club_${seed.club.slug}`;
  statements.push(`
INSERT INTO clubs (id, slug, name, short_name, city, color_primary, color_secondary, color_accent, color_on_primary, logo_url, ics_home_feed_url, created_at)
VALUES (
  ${sqlEscape(clubId)},
  ${sqlEscape(seed.club.slug)},
  ${sqlEscape(seed.club.name)},
  ${sqlEscape(seed.club.shortName)},
  ${sqlEscape(seed.club.city)},
  ${sqlEscape(seed.club.colorPrimary)},
  ${sqlEscape(seed.club.colorSecondary)},
  ${sqlEscape(seed.club.colorAccent)},
  ${sqlEscape(seed.club.colorOnPrimary)},
  ${sqlEscape(seed.club.logoUrl ?? null)},
  ${sqlEscape(seed.club.icsHomeFeedUrl)},
  ${now}
)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  short_name = excluded.short_name,
  city = excluded.city,
  color_primary = excluded.color_primary,
  color_secondary = excluded.color_secondary,
  color_accent = excluded.color_accent,
  color_on_primary = excluded.color_on_primary,
  logo_url = excluded.logo_url,
  ics_home_feed_url = excluded.ics_home_feed_url;
  `.trim());

  const seasonId = `season_${seed.club.slug}_${seed.season.label.replace("/", "_")}`;
  statements.push(`
INSERT INTO seasons (id, club_id, label, starts_on, ends_on)
VALUES (
  ${sqlEscape(seasonId)},
  ${sqlEscape(clubId)},
  ${sqlEscape(seed.season.label)},
  ${sqlEscape(seed.season.startsOn)},
  ${sqlEscape(seed.season.endsOn)}
)
ON CONFLICT(id) DO NOTHING;
  `.trim());

  const groupId = `group_${seed.group.slug}`;
  statements.push(`
INSERT INTO groups (id, slug, name, club_id, timezone, created_at)
VALUES (
  ${sqlEscape(groupId)},
  ${sqlEscape(seed.group.slug)},
  ${sqlEscape(seed.group.name)},
  ${sqlEscape(clubId)},
  ${sqlEscape(seed.group.timezone ?? "Europe/Amsterdam")},
  ${now}
)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  club_id = excluded.club_id,
  timezone = excluded.timezone;
  `.trim());

  const memberMap = new Map<string, string>();
  for (let index = 0; index < seed.members.length; index++) {
    const m = seed.members[index]!;
    const memberId = `member_${seed.group.slug}_${m.slug}`;
    const initials = m.initials ?? m.displayName.slice(0, 2).toUpperCase();
    const sortOrder = m.sortOrder ?? index + 1;
    memberMap.set(m.slug, memberId);

    statements.push(`
INSERT INTO members (id, group_id, slug, display_name, initials, avatar_color, is_active, sort_order, created_at)
VALUES (
  ${sqlEscape(memberId)},
  ${sqlEscape(groupId)},
  ${sqlEscape(m.slug)},
  ${sqlEscape(m.displayName)},
  ${sqlEscape(initials)},
  ${sqlEscape(m.avatarColor)},
  1,
  ${sortOrder},
  ${now}
)
ON CONFLICT(group_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  initials = excluded.initials,
  avatar_color = excluded.avatar_color,
  sort_order = excluded.sort_order;
    `.trim());
  }

  for (let index = 0; index < seed.passes.length; index++) {
    const p = seed.passes[index]!;
    const passId = `pass_${seed.group.slug}_${index + 1}`;
    const holderMemberId = memberMap.get(p.holder) ?? null;
    const sortOrder = p.sortOrder ?? index + 1;

    statements.push(`
INSERT INTO passes (id, group_id, label, seat_info, holder_member_id, is_active, sort_order, created_at)
VALUES (
  ${sqlEscape(passId)},
  ${sqlEscape(groupId)},
  ${sqlEscape(p.label)},
  ${sqlEscape(p.seatInfo ?? null)},
  ${sqlEscape(holderMemberId)},
  1,
  ${sortOrder},
  ${now}
)
ON CONFLICT(group_id, label) DO UPDATE SET
  seat_info = excluded.seat_info,
  holder_member_id = excluded.holder_member_id,
  sort_order = excluded.sort_order;
    `.trim());

    for (const ownerSlug of p.owners) {
      const ownerMemberId = memberMap.get(ownerSlug);
      if (ownerMemberId) {
        statements.push(`
INSERT INTO pass_owners (pass_id, member_id, share_note)
VALUES (${sqlEscape(passId)}, ${sqlEscape(ownerMemberId)}, NULL)
ON CONFLICT(pass_id, member_id) DO NOTHING;
        `.trim());
      }
    }
  }

  return statements.join("\n\n");
}

export async function runSeed(args = process.argv.slice(2)) {
  const isRemote = args.includes("--remote");
  const isConfirmed = args.includes("--confirm");

  let customFile: string | null = null;
  for (const arg of args) {
    if (arg.startsWith("--file=")) {
      customFile = arg.slice(7);
    }
  }

  if (isRemote && !isConfirmed) {
    console.error("Refusing to seed remote/production database without --confirm");
    process.exit(1);
  }

  let seedFilePath: string;
  if (customFile) {
    seedFilePath = path.resolve(process.cwd(), customFile);
    if (!fs.existsSync(seedFilePath)) {
      console.error(`Error: Seed file not found at ${seedFilePath}`);
      process.exit(1);
    }
  } else if (isRemote) {
    const localSeedPath = path.resolve(process.cwd(), "seed/group.local.json");
    if (!fs.existsSync(localSeedPath)) {
      console.error(
        "Error: Cannot seed remote database: seed/group.local.json not found (or specify --file=<path>)"
      );
      process.exit(1);
    }
    seedFilePath = localSeedPath;
  } else {
    const localSeedPath = path.resolve(process.cwd(), "seed/group.local.json");
    const exampleSeedPath = path.resolve(process.cwd(), "seed/group.example.json");
    seedFilePath = fs.existsSync(localSeedPath) ? localSeedPath : exampleSeedPath;
  }

  console.log(`Loading seed data from ${seedFilePath}`);
  const rawJson = fs.readFileSync(seedFilePath, "utf-8");
  const seed: SeedData = JSON.parse(rawJson);

  if (isRemote) {
    console.log("Generating idempotent SQL for remote D1 execution...");
    const seedSql = generateSeedSql(seed);
    const wranglerDir = path.resolve(process.cwd(), ".wrangler");
    if (!fs.existsSync(wranglerDir)) {
      fs.mkdirSync(wranglerDir, { recursive: true });
    }
    const tempSqlPath = path.join(wranglerDir, "seed-remote.sql");
    fs.writeFileSync(tempSqlPath, seedSql, "utf-8");

    try {
      console.log("Executing seed script against remote Cloudflare D1 database 'passie'...");
      execSync(`pnpm exec wrangler d1 execute passie --remote --file="${tempSqlPath}" -y`, {
        stdio: "inherit",
      });
      console.log("Remote seeding complete!");
    } finally {
      if (fs.existsSync(tempSqlPath)) {
        fs.unlinkSync(tempSqlPath);
      }
    }
    return;
  }

  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    persist: { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema });
  const now = Math.floor(Date.now() / 1000);

  console.log("Seeding club...");
  const clubId = `club_${seed.club.slug}`;
  await db
    .insert(schema.clubs)
    .values({
      id: clubId,
      slug: seed.club.slug,
      name: seed.club.name,
      shortName: seed.club.shortName,
      city: seed.club.city,
      colorPrimary: seed.club.colorPrimary,
      colorSecondary: seed.club.colorSecondary,
      colorAccent: seed.club.colorAccent,
      colorOnPrimary: seed.club.colorOnPrimary,
      logoUrl: seed.club.logoUrl ?? null,
      icsHomeFeedUrl: seed.club.icsHomeFeedUrl,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: schema.clubs.slug,
      set: {
        name: seed.club.name,
        shortName: seed.club.shortName,
        city: seed.club.city,
        colorPrimary: seed.club.colorPrimary,
        colorSecondary: seed.club.colorSecondary,
        colorAccent: seed.club.colorAccent,
        colorOnPrimary: seed.club.colorOnPrimary,
        logoUrl: seed.club.logoUrl ?? null,
        icsHomeFeedUrl: seed.club.icsHomeFeedUrl,
      },
    });

  console.log("Seeding season...");
  const seasonId = `season_${seed.club.slug}_${seed.season.label.replace("/", "_")}`;
  const existingSeason = await db.query.seasons.findFirst({
    where: and(eq(schema.seasons.clubId, clubId), eq(schema.seasons.label, seed.season.label)),
  });

  if (!existingSeason) {
    await db.insert(schema.seasons).values({
      id: seasonId,
      clubId,
      label: seed.season.label,
      startsOn: seed.season.startsOn,
      endsOn: seed.season.endsOn,
    });
  }

  console.log("Seeding group...");
  const groupId = `group_${seed.group.slug}`;
  await db
    .insert(schema.groups)
    .values({
      id: groupId,
      slug: seed.group.slug,
      name: seed.group.name,
      clubId,
      timezone: seed.group.timezone ?? "Europe/Amsterdam",
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: schema.groups.slug,
      set: {
        name: seed.group.name,
        clubId,
        timezone: seed.group.timezone ?? "Europe/Amsterdam",
      },
    });

  console.log("Seeding members...");
  const memberMap = new Map<string, string>(); // slug -> memberId

  for (let index = 0; index < seed.members.length; index++) {
    const m = seed.members[index]!;
    const memberId = `member_${seed.group.slug}_${m.slug}`;
    const initials = m.initials ?? m.displayName.slice(0, 2).toUpperCase();
    const sortOrder = m.sortOrder ?? index + 1;

    await db
      .insert(schema.members)
      .values({
        id: memberId,
        groupId,
        slug: m.slug,
        displayName: m.displayName,
        initials,
        avatarColor: m.avatarColor,
        isActive: 1,
        sortOrder,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.members.groupId, schema.members.slug],
        set: {
          displayName: m.displayName,
          initials,
          avatarColor: m.avatarColor,
          sortOrder,
        },
      });

    memberMap.set(m.slug, memberId);
  }

  console.log("Seeding passes & pass owners...");
  for (let index = 0; index < seed.passes.length; index++) {
    const p = seed.passes[index]!;
    const passId = `pass_${seed.group.slug}_${index + 1}`;
    const holderMemberId = memberMap.get(p.holder) ?? null;
    const sortOrder = p.sortOrder ?? index + 1;

    await db
      .insert(schema.passes)
      .values({
        id: passId,
        groupId,
        label: p.label,
        seatInfo: p.seatInfo ?? null,
        holderMemberId,
        isActive: 1,
        sortOrder,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.passes.groupId, schema.passes.label],
        set: {
          seatInfo: p.seatInfo ?? null,
          holderMemberId,
          sortOrder,
        },
      });

    // Seed pass owners
    for (const ownerSlug of p.owners) {
      const ownerMemberId = memberMap.get(ownerSlug);
      if (ownerMemberId) {
        await db
          .insert(schema.passOwners)
          .values({
            passId,
            memberId: ownerMemberId,
            shareNote: null,
          })
          .onConflictDoNothing();
      }
    }
  }

  console.log("Seeding complete!");
  await proxy.dispose();
}

if (process.argv[1]?.endsWith("seed.ts")) {
  runSeed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}

