import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseIcsEvents,
  parseIcsDate,
  extractOpponent,
  extractCompetition,
  unfoldIcsLines,
  unescapeIcsValue,
} from "../ics";

describe("ICS Parser", () => {
  it("unfolds lines continuing with whitespace", () => {
    const raw = "SUMMARY:Excelsior - Sparta \n Rotterdam\nLOCATION:Rotterdam";
    const lines = unfoldIcsLines(raw);
    expect(lines[0]).toBe("SUMMARY:Excelsior - Sparta Rotterdam");
  });

  it("unescapes escaped characters", () => {
    const raw = "Van Donge \\& De Roo Stadion\\, Rotterdam\\; Netherlands";
    const unescaped = unescapeIcsValue(raw);
    expect(unescaped).toBe("Van Donge \\& De Roo Stadion, Rotterdam; Netherlands");
  });

  it("extracts opponent and strips score suffixes", () => {
    expect(extractOpponent("Excelsior - NEC")).toBe("NEC");
    expect(extractOpponent("Excelsior - Feyenoord (1-1)")).toBe("Feyenoord");
    expect(extractOpponent("Excelsior - Ajax (2-0)")).toBe("Ajax");
    expect(extractOpponent("[Eredivisie] Excelsior - AZ")).toBe("AZ");
    expect(extractOpponent("KNVB Beker: Excelsior - Vitesse")).toBe("Vitesse");
  });

  it("extracts competition from categories, bracket prefix, or summary prefix", () => {
    expect(extractCompetition("Excelsior - NEC", ["Eredivisie", "Voetbal"])).toBe("Eredivisie");
    expect(extractCompetition("Excelsior - Feyenoord", ["KNVB Beker"])).toBe("KNVB Beker");
    expect(extractCompetition("[Keuken Kampioen Divisie] Excelsior - TOP Oss")).toBe("Keuken Kampioen Divisie");
    expect(extractCompetition("KNVB Beker: Excelsior - Ajax")).toBe("KNVB Beker");
    expect(extractCompetition("Excelsior - Utrecht")).toBeUndefined();
  });

  it("parses UTC dates with Z suffix", () => {
    // 2026-09-13 10:15:00 UTC = 1789380900
    const ts = parseIcsDate("20260913T101500Z");
    expect(ts).toBe(Math.floor(Date.UTC(2026, 8, 13, 10, 15, 0) / 1000));
  });

  it("parses explicit TZID parameter for Europe/Amsterdam (summer time / CEST: UTC+2)", () => {
    // September 13 in Amsterdam is CEST (UTC+2) -> 14:15:00 local = 12:15:00 UTC
    const ts = parseIcsDate("20260913T141500", "Europe/Amsterdam");
    expect(ts).toBe(Math.floor(Date.UTC(2026, 8, 13, 12, 15, 0) / 1000));
  });

  it("parses explicit TZID parameter for Europe/Amsterdam (winter time / CET: UTC+1)", () => {
    // December 13 in Amsterdam is CET (UTC+1) -> 14:15:00 local = 13:15:00 UTC
    const ts = parseIcsDate("20261213T141500", "Europe/Amsterdam");
    expect(ts).toBe(Math.floor(Date.UTC(2026, 11, 13, 13, 15, 0) / 1000));
  });

  it("parses floating local date-time assuming default timezone (Europe/Amsterdam)", () => {
    const ts = parseIcsDate("20260913T141500");
    expect(ts).toBe(Math.floor(Date.UTC(2026, 8, 13, 12, 15, 0) / 1000));
  });

  it("parses VALUE=DATE date-only strings", () => {
    // 2026-09-13 00:00:00 local (CEST UTC+2) = 2026-09-12 22:00:00 UTC
    const ts = parseIcsDate("20260913");
    expect(ts).toBe(Math.floor(Date.UTC(2026, 8, 12, 22, 0, 0) / 1000));
  });

  it("handles DTSTART property line with parameters directly", () => {
    const tsWithTzid = parseIcsDate("DTSTART;TZID=Europe/Amsterdam:20260913T141500");
    expect(tsWithTzid).toBe(Math.floor(Date.UTC(2026, 8, 13, 12, 15, 0) / 1000));

    const tsValueDate = parseIcsDate("DTSTART;VALUE=DATE:20260913");
    expect(tsValueDate).toBe(Math.floor(Date.UTC(2026, 8, 12, 22, 0, 0) / 1000));
  });

  it("parses sample ICS file accurately", () => {
    const icsContent = fs.readFileSync(
      path.resolve(__dirname, "fixtures/excelsior-home.ics"),
      "utf-8"
    );

    const fixtures = parseIcsEvents(icsContent);
    expect(fixtures).toHaveLength(4);

    // Event 1: NEC
    expect(fixtures[0]?.opponent).toBe("NEC");
    expect(fixtures[0]?.status).toBe("scheduled");
    expect(fixtures[0]?.sequence).toBe(1);
    expect(fixtures[0]?.kickoffAt).toBe(Math.floor(Date.UTC(2026, 8, 13, 10, 15, 0) / 1000));
    expect(fixtures[0]?.lastModified).toBe(Math.floor(Date.UTC(2026, 7, 10, 12, 0, 0) / 1000));

    // Event 2: Feyenoord (1-1 score stripped)
    expect(fixtures[1]?.opponent).toBe("Feyenoord");
    expect(fixtures[1]?.status).toBe("scheduled");

    // Event 3: Ajax (Cancelled)
    expect(fixtures[2]?.opponent).toBe("Ajax");
    expect(fixtures[2]?.status).toBe("cancelled");
    expect(fixtures[2]?.sequence).toBe(2);

    // Event 4: Sparta Rotterdam (unfolded line)
    expect(fixtures[3]?.opponent).toBe("Sparta Rotterdam");
    expect(fixtures[3]?.status).toBe("scheduled");
  });

  it("parses ICS events with TZID and CATEGORIES parameters", () => {
    const rawIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-tzid-1@test
DTSTART;TZID=Europe/Amsterdam:20260913T143000
SUMMARY:Excelsior - FC Twente
LOCATION:Van Donge & De Roo Stadion
STATUS:CONFIRMED
CATEGORIES:Eredivisie,Voetbal
SEQUENCE:0
LAST-MODIFIED:20260815T100000Z
END:VEVENT
END:VCALENDAR`;

    const fixtures = parseIcsEvents(rawIcs);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]?.opponent).toBe("FC Twente");
    expect(fixtures[0]?.kickoffAt).toBe(Math.floor(Date.UTC(2026, 8, 13, 12, 30, 0) / 1000));
    expect(fixtures[0]?.competition).toBe("Eredivisie");
    expect(fixtures[0]?.categories).toEqual(["Eredivisie", "Voetbal"]);
  });
});
