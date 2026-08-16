import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseIcsEvents,
  extractOpponent,
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
});
