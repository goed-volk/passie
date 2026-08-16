import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("i18n discipline", () => {
  it("ensures key translation dictionary entries exist in nl.ts", () => {
    const nlFile = fs.readFileSync(path.resolve(process.cwd(), "src/i18n/nl.ts"), "utf-8");
    expect(nlFile).toContain("whoAreYouTitle");
    expect(nlFile).toContain("step1Title");
    expect(nlFile).toContain("step2Title");
    expect(nlFile).toContain("step3Title");
    expect(nlFile).toContain("statusUnindicated");
  });
});
