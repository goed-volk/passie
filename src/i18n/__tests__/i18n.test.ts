import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { formatEventText, formatKickoffDateTime, formatDeadlineDateTime, formatTimelineTimestamp, t } from "../t";
import { nl } from "../nl";

describe("i18n discipline", () => {
  it("ensures key translation dictionary entries exist in nl.ts", () => {
    const nlFile = fs.readFileSync(path.resolve(process.cwd(), "src/i18n/nl.ts"), "utf-8");
    expect(nlFile).toContain("loginTitle");
    expect(nlFile).toContain("step1Title");
    expect(nlFile).toContain("step2Title");
    expect(nlFile).toContain("step3Title");
    expect(nlFile).toContain("statusUnindicated");
    expect(nlFile).toContain("themeTitle");
    expect(nlFile).toContain("themeRedBlack");
    expect(nlFile).toContain("themeBlackRed");
  });

  it("translates parameterized strings with t()", () => {
    expect(t("appName")).toBe("Passie");
    expect(t("passLabel")).toBe("Pas");
    expect(t("reclaimConfirmTitle", { name: "Daan" })).toBe("Pas terugclaimen van Daan?");
  });

  it("formats kickoff date-time in Dutch with Europe/Amsterdam timezone", () => {
    // 2026-09-13 14:30:00 UTC = 16:30 CEST on Sunday (zo) Sep 13
    const utcTimestamp = Math.floor(Date.UTC(2026, 8, 13, 14, 30, 0) / 1000);
    const formatted = formatKickoffDateTime(utcTimestamp, "Europe/Amsterdam");
    expect(formatted).toContain("13");
    expect(formatted).toContain("16:30");
  });

  it("formats deadline date-time in Dutch with weekday, day, month and time", () => {
    const utcTimestamp = Math.floor(Date.UTC(2026, 8, 13, 14, 30, 0) / 1000);
    const formatted = formatDeadlineDateTime(utcTimestamp, "Europe/Amsterdam");
    expect(formatted).toContain("zondag");
    expect(formatted).toContain("13");
    expect(formatted).toContain("september");
    expect(formatted).toContain("16:30");
  });

  it("formats pass.reclaimed event with member or guest recipient", () => {
    const membersMap = new Map([
      ["member_1", "Sam"],
      ["member_2", "Daan"],
      ["member_3", "Eva"],
    ]);
    const passLabelsMap = new Map([
      ["pass_1", "Pas 1"],
      ["pass_2", "Bram de Vries"],
    ]);

    const textMember = formatEventText(
      "pass.reclaimed",
      { passId: "pass_1", reclaimedFromMemberId: "member_2", reclaimedFromKind: "self" },
      membersMap,
      passLabelsMap,
      "Sam"
    );
    expect(textMember).toBe("Sam claimt Pas 1 terug van Daan");

    const textNamedPass = formatEventText(
      "pass.kept",
      { passId: "pass_2" },
      membersMap,
      passLabelsMap,
      "Ilse"
    );
    expect(textNamedPass).toBe("Ilse gebruikt pas van Bram de Vries");

    const textReleasedNamedPass = formatEventText(
      "pass.released",
      { passId: "pass_2" },
      membersMap,
      passLabelsMap,
      "Ilse"
    );
    expect(textReleasedNamedPass).toBe("Ilse geeft pas van Bram de Vries vrij");

    const textAssignedNamedPass = formatEventText(
      "pass.assigned",
      { passId: "pass_2", memberId: "member_2", kind: "self" },
      membersMap,
      passLabelsMap
    );
    expect(textAssignedNamedPass).toBe("Pas van Bram de Vries toegewezen aan Daan");

    const textGuest = formatEventText(
      "pass.reclaimed",
      { passId: "pass_1", reclaimedFromMemberId: "member_3", reclaimedFromKind: "guest", reclaimedFromGuestName: "Kees" },
      membersMap,
      passLabelsMap,
      "Sam"
    );
    expect(textGuest).toBe("Sam claimt Pas 1 terug van Eva's gast (Kees)");

    const textHandover = formatEventText(
      "possession.handover",
      { passId: "pass_1", fromMemberId: "member_1", toMemberId: "member_2" },
      membersMap,
      passLabelsMap,
      "Sam"
    );
    expect(textHandover).toBe("Pas 1 gewisseld van Sam naar Daan");
  });

  it("formats timeline timestamps adaptively based on age (today, <7d, >7d)", () => {
    // Reference date: Saturday 2026-10-10 15:30:00 CEST (13:30:00 UTC)
    const refDate = new Date(Date.UTC(2026, 9, 10, 13, 30, 0));

    // Same day: 2026-10-10 09:25:00 CEST (07:25:00 UTC)
    const todaySec = Math.floor(Date.UTC(2026, 9, 10, 7, 25, 0) / 1000);
    expect(formatTimelineTimestamp(todaySec, refDate, "Europe/Amsterdam")).toBe("09:25");

    // 3 days ago: Wednesday 2026-10-07 11:15:00 CEST (09:15:00 UTC)
    const threeDaysAgoSec = Math.floor(Date.UTC(2026, 9, 7, 9, 15, 0) / 1000);
    const threeDaysFormatted = formatTimelineTimestamp(threeDaysAgoSec, refDate, "Europe/Amsterdam");
    expect(threeDaysFormatted).toContain("wo");
    expect(threeDaysFormatted).toContain("11:15");

    // 12 days ago: Monday 2026-09-28 20:30:00 CEST (18:30:00 UTC)
    const twelveDaysAgoSec = Math.floor(Date.UTC(2026, 8, 28, 18, 30, 0) / 1000);
    const twelveDaysFormatted = formatTimelineTimestamp(twelveDaysAgoSec, refDate, "Europe/Amsterdam");
    expect(twelveDaysFormatted).toContain("28");
    expect(twelveDaysFormatted).toContain("sep");
    expect(twelveDaysFormatted).toContain("20:30");
  });
});
