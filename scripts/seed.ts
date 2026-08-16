import fs from "node:fs";
import path from "node:path";
import { getPlatformProxy } from "./proxy";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/server/schema";

interface SeedClub {
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

interface SeedSeason {
  label: string;
  startsOn: string;
  endsOn: string;
}

interface SeedGroup {
  slug: string;
  name: string;
  timezone?: string;
}

interface SeedMember {
  slug: string;
  displayName: string;
  initials?: string;
  avatarColor: string;
  sortOrder?: number;
}

interface SeedPass {
  label: string;
  seatInfo?: string | null;
  owners: string[];
  holder: string;
  sortOrder?: number;
}

interface SeedData {
  club: SeedClub;
  season: SeedSeason;
  group: SeedGroup;
  members: SeedMember[];
  passes: SeedPass[];
}

async function main() {
  const args = process.argv.slice(2);
  const isRemote = args.includes("--remote");
  const isConfirmed = args.includes("--confirm");

  if (isRemote && !isConfirmed) {
    console.error("Refusing to seed remote/production database without --confirm");
    process.exit(1);
  }

  const localSeedPath = path.resolve(process.cwd(), "seed/group.local.json");
  const exampleSeedPath = path.resolve(process.cwd(), "seed/group.example.json");

  let seedFilePath = exampleSeedPath;
  if (fs.existsSync(localSeedPath)) {
    seedFilePath = localSeedPath;
    console.log(`Loading seed data from ${seedFilePath}`);
  } else {
    console.log(`Loading seed data from ${seedFilePath}`);
  }

  const rawJson = fs.readFileSync(seedFilePath, "utf-8");
  const seed: SeedData = JSON.parse(rawJson);

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

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
