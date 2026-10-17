import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolvePassieEnv, isCloudDeployed } from "../env";

describe("Environment resolution and cloud deployment helpers", () => {
  const originalEnv = { ...process.env };
  const envMap = process.env as Record<string, string | undefined>;

  beforeEach(() => {
    delete envMap.PASSIE_ENV;
  });

  afterEach(() => {
    delete envMap.PASSIE_ENV;
    delete envMap.NODE_ENV;
    Object.assign(process.env, originalEnv);
  });

  it("resolves from env object when passed", () => {
    expect(resolvePassieEnv({ PASSIE_ENV: "staging" })).toBe("staging");
    expect(resolvePassieEnv({ PASSIE_ENV: "production" })).toBe("production");
    expect(resolvePassieEnv({ PASSIE_ENV: "development" })).toBe("development");
    expect(resolvePassieEnv({ PASSIE_ENV: "test" })).toBe("test");
  });

  it("trims whitespace from environment strings", () => {
    expect(resolvePassieEnv({ PASSIE_ENV: "  staging  " })).toBe("staging");
    expect(resolvePassieEnv({ PASSIE_ENV: "  production  " })).toBe("production");
  });

  it("resolves from process.env when env object is empty or missing", () => {
    process.env.PASSIE_ENV = "staging";
    expect(resolvePassieEnv()).toBe("staging");
    expect(resolvePassieEnv({})).toBe("staging");

    process.env.PASSIE_ENV = "production";
    expect(resolvePassieEnv()).toBe("production");
  });

  it("falls back to NODE_ENV when PASSIE_ENV is unset", () => {
    delete envMap.PASSIE_ENV;

    envMap.NODE_ENV = "test";
    expect(resolvePassieEnv()).toBe("test");

    envMap.NODE_ENV = "production";
    expect(resolvePassieEnv()).toBe("production");

    envMap.NODE_ENV = "development";
    expect(resolvePassieEnv()).toBe("development");
  });

  it("correctly identifies cloud deployed environments", () => {
    expect(isCloudDeployed({ PASSIE_ENV: "production" })).toBe(true);
    expect(isCloudDeployed({ PASSIE_ENV: "staging" })).toBe(true);
    expect(isCloudDeployed({ PASSIE_ENV: "development" })).toBe(false);
    expect(isCloudDeployed({ PASSIE_ENV: "test" })).toBe(false);
  });
});
