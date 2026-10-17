import { describe, it, expect } from "vitest";
import {
  generateSeedSql,
  parseSeedArgs,
  assertRemoteSeedAllowed,
  type SeedData,
} from "../seed";

describe("generateSeedSql", () => {
  const sampleSeed: SeedData = {
    club: {
      slug: "excelsior",
      name: "SBV Excelsior",
      shortName: "Excelsior",
      city: "Rotterdam",
      colorPrimary: "#000000",
      colorSecondary: "#E31B23",
      colorAccent: "#E31B23",
      colorOnPrimary: "#FFFFFF",
      logoUrl: null,
      icsHomeFeedUrl: "https://ics.fixtur.es/v2/home/excelsior.ics",
    },
    season: {
      label: "2026/2027",
      startsOn: "2026-08-01",
      endsOn: "2027-06-30",
    },
    group: {
      slug: "goedvolk",
      name: "Goedvolk",
      timezone: "Europe/Amsterdam",
    },
    members: [
      {
        slug: "bram",
        displayName: "Bram",
        initials: "BR",
        avatarColor: "#059669",
        sortOrder: 1,
      },
      {
        slug: "daan",
        displayName: "Daan",
        avatarColor: "#D97706",
      },
    ],
    passes: [
      {
        label: "Vak B1",
        seatInfo: "Rij 4, Stoel 12",
        owners: ["bram"],
        holder: "bram",
        sortOrder: 1,
      },
    ],
  };

  it("generates valid SQL insert/upsert statements for clubs, seasons, groups, members, passes and owners", () => {
    const sql = generateSeedSql(sampleSeed);
    expect(sql).toContain("INSERT INTO clubs");
    expect(sql).toContain("'club_excelsior'");
    expect(sql).toContain("'https://ics.fixtur.es/v2/home/excelsior.ics'");
    expect(sql).toContain("ON CONFLICT(slug) DO UPDATE SET");

    expect(sql).toContain("INSERT INTO seasons");
    expect(sql).toContain("'season_excelsior_2026_2027'");
    expect(sql).toContain("ON CONFLICT(id) DO NOTHING");

    expect(sql).toContain("INSERT INTO groups");
    expect(sql).toContain("'group_goedvolk'");

    expect(sql).toContain("INSERT INTO members");
    expect(sql).toContain("'member_goedvolk_bram'");
    expect(sql).toContain("'member_goedvolk_daan'");
    expect(sql).toContain("ON CONFLICT(group_id, slug) DO UPDATE SET");

    expect(sql).toContain("INSERT INTO passes");
    expect(sql).toContain("'pass_goedvolk_1'");
    expect(sql).toContain("'Vak B1'");

    expect(sql).toContain("INSERT INTO pass_owners");
    expect(sql).toContain("'pass_goedvolk_1', 'member_goedvolk_bram'");
  });

  it("handles SQL escaping properly for strings with single quotes", () => {
    const seedWithQuote: SeedData = {
      ...sampleSeed,
      club: {
        ...sampleSeed.club,
        name: "L'Excelsior",
      },
    };
    const sql = generateSeedSql(seedWithQuote);
    expect(sql).toContain("'L''Excelsior'");
  });

  it("generates auth_user insertion and member user_id linkage when member has email", () => {
    const seedWithEmail: SeedData = {
      ...sampleSeed,
      members: [
        {
          slug: "bram",
          displayName: "Bram",
          avatarColor: "#059669",
          email: "bram@goedvolk.org",
          role: "admin",
        },
      ],
    };
    const sql = generateSeedSql(seedWithEmail);
    expect(sql).toContain("INSERT INTO auth_user");
    expect(sql).toContain("'bram@goedvolk.org'");
    expect(sql).toContain("'admin'");
    expect(sql).toContain("UPDATE members");
    expect(sql).toContain("WHERE id = 'member_goedvolk_bram'");
  });
});

describe("parseSeedArgs", () => {
  it("parses flags correctly with --env=staging and --remote", () => {
    const parsed = parseSeedArgs(["--env=staging", "--remote", "--file=seed/group.example.json"]);
    expect(parsed.isRemote).toBe(true);
    expect(parsed.env).toBe("staging");
    expect(parsed.customFile).toBe("seed/group.example.json");
  });

  it("parses space-separated --env flag", () => {
    const parsed = parseSeedArgs(["--env", "staging", "--remote"]);
    expect(parsed.isRemote).toBe(true);
    expect(parsed.env).toBe("staging");
  });
});

describe("assertRemoteSeedAllowed", () => {
  it("does nothing when isRemote is false", () => {
    expect(() =>
      assertRemoteSeedAllowed({ isRemote: false, env: "production", dbName: "passie" })
    ).not.toThrow();
  });

  it("rejects remote seed if env is omitted", () => {
    expect(() =>
      assertRemoteSeedAllowed({ isRemote: true })
    ).toThrow("Direct remote seeding of production database 'passie' is disabled");
  });

  it("rejects remote seed if env is production", () => {
    expect(() =>
      assertRemoteSeedAllowed({ isRemote: true, env: "production" })
    ).toThrow("Direct remote seeding of production database 'passie' is disabled");
  });

  it("rejects remote seed if env is not staging", () => {
    expect(() =>
      assertRemoteSeedAllowed({ isRemote: true, env: "development" })
    ).toThrow("Remote seeding is only permitted for staging environment, got 'development'");
  });

  it("rejects remote seed if database name is passie", () => {
    expect(() =>
      assertRemoteSeedAllowed({
        isRemote: true,
        env: "staging",
        dbName: "passie",
      })
    ).toThrow("Safety assertion failed: Database matches production database.");
  });

  it("rejects remote seed if database id matches production UUID", () => {
    expect(() =>
      assertRemoteSeedAllowed({
        isRemote: true,
        env: "staging",
        dbName: "passie-staging-db",
        dbId: "176bd801-9d6f-4d7e-8306-83ea0a0be157",
      })
    ).toThrow("Safety assertion failed: Database matches production database.");
  });

  it("permits remote seed for staging with dedicated database", () => {
    expect(() =>
      assertRemoteSeedAllowed({
        isRemote: true,
        env: "staging",
        dbName: "passie-staging-db",
        dbId: "1c936aac-181c-47dc-98c2-6f6d64416595",
      })
    ).not.toThrow();
  });
});
