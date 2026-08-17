import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { formatEventText, formatKickoffDateTime, t } from "../t";
import { nl } from "../nl";

describe("i18n discipline", () => {
  it("ensures key translation dictionary entries exist in nl.ts", () => {
    const nlFile = fs.readFileSync(path.resolve(process.cwd(), "src/i18n/nl.ts"), "utf-8");
    expect(nlFile).toContain("whoAreYouTitle");
    expect(nlFile).toContain("step1Title");
    expect(nlFile).toContain("step2Title");
    expect(nlFile).toContain("step3Title");
    expect(nlFile).toContain("statusUnindicated");
  });

  it("translates parameterized strings with t()", () => {
    expect(t("appName")).toBe("Passie");
    expect(t("passLabel")).toBe("Pas");
  });

  it("formats kickoff date-time in Dutch with Europe/Amsterdam timezone", () => {
    // 2026-09-13 14:30:00 UTC = 16:30 CEST on Sunday (zo) Sep 13
    const utcTimestamp = Math.floor(Date.UTC(2026, 8, 13, 14, 30, 0) / 1000);
    const formatted = formatKickoffDateTime(utcTimestamp, "Europe/Amsterdam");
    expect(formatted).toContain("13");
    expect(formatted).toContain("16:30");
  });

  it("formats fixture.rescheduled event with human-readable localized kickoff date/time", () => {
    const utcTimestamp = Math.floor(Date.UTC(2026, 8, 13, 14, 30, 0) / 1000);
    const text = formatEventText(
      "fixture.rescheduled",
      { newKickoffAt: utcTimestamp },
      new Map(),
      new Map(),
      undefined,
      "Europe/Amsterdam"
    );
    expect(text).toContain("Aftrap gewijzigd naar");
    expect(text).not.toContain(String(utcTimestamp));
    expect(text).toContain("16:30");
  });
});
