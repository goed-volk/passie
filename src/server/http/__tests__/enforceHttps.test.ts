import { describe, it, expect, vi } from "vitest";
import {
  enforceHttpsAndSecurityHeaders,
  HSTS_HEADER_VALUE,
  isLocalHostname,
} from "../enforceHttps";

describe("enforceHttpsAndSecurityHeaders", () => {
  it("identifies local hostnames accurately", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("::1")).toBe(true);
    expect(isLocalHostname("passie.local")).toBe(true);
    expect(isLocalHostname("passie.goedvolk.org")).toBe(false);
  });

  it("redirects http://passie.goedvolk.org/inloggen to https:// with 301 and HSTS header without calling handler", async () => {
    const req = new Request("http://passie.goedvolk.org/inloggen?redirect=%2F");
    const handler = vi.fn(async () => new Response("ok"));

    const res = await enforceHttpsAndSecurityHeaders(req, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(
      "https://passie.goedvolk.org/inloggen?redirect=%2F"
    );
    expect(res.headers.get("Strict-Transport-Security")).toBe(
      HSTS_HEADER_VALUE
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("redirects when x-forwarded-proto is http on a production hostname", async () => {
    const req = new Request("https://passie.goedvolk.org/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: {
        "x-forwarded-proto": "http",
      },
    });
    const handler = vi.fn(async () => new Response("ok"));

    const res = await enforceHttpsAndSecurityHeaders(req, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(
      "https://passie.goedvolk.org/api/auth/email-otp/send-verification-otp"
    );
    expect(res.headers.get("Strict-Transport-Security")).toBe(
      HSTS_HEADER_VALUE
    );
  });

  it("appends HSTS and security headers to HTTPS production responses", async () => {
    const req = new Request("https://passie.goedvolk.org/inloggen");
    const handler = vi.fn(
      async () =>
        new Response("hello", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
    );

    const res = await enforceHttpsAndSecurityHeaders(req, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
    expect(res.headers.get("Strict-Transport-Security")).toBe(
      HSTS_HEADER_VALUE
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("passes http://localhost:3000/inloggen through untouched without redirecting", async () => {
    const req = new Request("http://localhost:3000/inloggen");
    const originalResponse = new Response("local dev", { status: 200 });
    const handler = vi.fn(async () => originalResponse);

    const res = await enforceHttpsAndSecurityHeaders(req, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(res).toBe(originalResponse);
    expect(res.status).toBe(200);
    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
  });
});
