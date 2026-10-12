import { describe, it, expect } from "vitest";
import { assertSameOrigin, isSameOrigin, CrossOriginRequestError } from "../assertSameOrigin";

describe("assertSameOrigin", () => {
  it("allows same-origin requests matching Host header", () => {
    const req = new Request("http://localhost:3000/api/pool/test/queue", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "same-origin",
      },
    });

    expect(isSameOrigin(req)).toBe(true);
    expect(() => assertSameOrigin(req)).not.toThrow();
  });

  it("allows requests without Origin or Sec-Fetch-Site (e.g. server-to-server or curl)", () => {
    const req = new Request("http://localhost:3000/api/pool/test/queue", {
      method: "POST",
    });

    expect(isSameOrigin(req)).toBe(true);
    expect(() => assertSameOrigin(req)).not.toThrow();
  });

  it("rejects cross-site requests signaled by Sec-Fetch-Site", () => {
    const req = new Request("http://localhost:3000/api/pool/test/queue", {
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "cross-site",
      },
    });

    expect(isSameOrigin(req)).toBe(false);
    expect(() => assertSameOrigin(req)).toThrow(CrossOriginRequestError);
  });

  it("rejects requests where Origin belongs to an unauthorized domain", () => {
    const req = new Request("https://passie.goedvolk.org/api/pool/test/queue", {
      method: "POST",
      headers: {
        Host: "passie.goedvolk.org",
        Origin: "https://evil-attacker.com",
      },
    });

    expect(isSameOrigin(req)).toBe(false);
    expect(() => assertSameOrigin(req)).toThrow(CrossOriginRequestError);
  });

  it("allows localhost origins during development", () => {
    const req = new Request("http://127.0.0.1:3000/api/pool/test/queue", {
      method: "POST",
      headers: {
        Host: "127.0.0.1:3000",
        Origin: "http://localhost:3000",
      },
    });

    expect(isSameOrigin(req)).toBe(true);
    expect(() => assertSameOrigin(req)).not.toThrow();
  });
});
