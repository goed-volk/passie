import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../[[...path]]/route";

describe("/ingest proxy route security & filtering", () => {
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    } else {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
    }
  });

  it("returns 404 when NEXT_PUBLIC_POSTHOG_KEY is not set (GET & POST)", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const fetchSpy = vi.spyOn(global, "fetch");

    const getReq = new NextRequest("http://localhost/ingest/decide?v=3");
    const getRes = await GET(getReq, { params: Promise.resolve({ path: ["decide"] }) });
    expect(getRes.status).toBe(404);
    const getJson = await getRes.json();
    expect(getJson).toEqual({ error: "Telemetry disabled" });

    const postReq = new NextRequest("http://localhost/ingest/e", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "pass.indicate_keep" }),
    });
    const postRes = await POST(postReq, { params: Promise.resolve({ path: ["e"] }) });
    expect(postRes.status).toBe(404);
    const postJson = await postRes.json();
    expect(postJson).toEqual({ error: "Telemetry disabled" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 404 for disallowed path prefixes", async () => {
    const req = new NextRequest("http://localhost/ingest/admin/secret");
    const res = await GET(req, { params: Promise.resolve({ path: ["admin", "secret"] }) });
    expect(res.status).toBe(404);
  });

  it("GET: forwards allowed path and strips sensitive headers from outbound request", async () => {
    let capturedHeaders: Headers | null = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ config: "ok" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=60",
          "set-cookie": "secret_cookie=val",
          "x-custom-leak": "leaked",
        },
      });
    });

    const req = new NextRequest("http://localhost/ingest/decide?v=3", {
      headers: {
        "content-type": "application/json",
        "user-agent": "test-agent",
        cookie: "passie_member=member_secret",
        authorization: "Bearer secret",
        "x-forwarded-for": "1.2.3.4",
        "cf-ray": "ray123",
      },
    });

    const res = await GET(req, { params: Promise.resolve({ path: ["decide"] }) });
    expect(res.status).toBe(200);

    // Verify outbound request headers allowlist
    const sentHeaders = capturedHeaders as Headers | null;
    expect(sentHeaders).not.toBeNull();
    expect(sentHeaders?.get("cookie")).toBeNull();
    expect(sentHeaders?.get("authorization")).toBeNull();
    expect(sentHeaders?.get("x-forwarded-for")).toBeNull();
    expect(sentHeaders?.get("cf-ray")).toBeNull();
    expect(sentHeaders?.get("user-agent")).toBe("test-agent");

    // Verify response headers stripping
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("x-custom-leak")).toBeNull();
  });

  it("POST: rejects payloads larger than 64 KB with 413", async () => {
    const largeBody = "x".repeat(65537);
    const req = new NextRequest("http://localhost/ingest/e", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(largeBody.length),
      },
      body: largeBody,
    });

    const res = await POST(req, { params: Promise.resolve({ path: ["e"] }) });
    expect(res.status).toBe(413);
  });

  it("POST: forwards valid events to upstream without cookies", async () => {
    let capturedBody: ArrayBuffer | null = null;
    let capturedHeaders: Headers | null = null;

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      capturedHeaders = new Headers(init?.headers);
      capturedBody = (init?.body as ArrayBuffer) ?? null;
      return new Response(JSON.stringify({ status: 1 }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const bodyText = JSON.stringify({ event: "pass.indicate_keep", properties: {} });
    const req = new NextRequest("http://localhost/ingest/e", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "passie_member=member_secret",
      },
      body: bodyText,
    });

    const res = await POST(req, { params: Promise.resolve({ path: ["e"] }) });
    expect(res.status).toBe(200);
    const sentHeaders = capturedHeaders as Headers | null;
    expect(sentHeaders).not.toBeNull();
    expect(sentHeaders?.get("cookie")).toBeNull();
    expect(capturedBody).not.toBeNull();
    const decodedBody = new TextDecoder().decode(capturedBody!);
    expect(decodedBody).toBe(bodyText);
  });
});
