import { describe, it, expect } from "vitest";
import { generateSeedSql, type SeedData } from "../seed";

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
});
