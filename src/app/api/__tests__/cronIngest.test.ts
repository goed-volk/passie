import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/cron/ingest/route";
import * as ingestModule from "@/server/ingest";

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

describe("POST /api/cron/ingest endpoint security and execution", () => {
  const originalEnv = process.env.PASSIE_CRON_SECRET;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PASSIE_CRON_SECRET = originalEnv;
    } else {
      delete (process.env as Record<string, string | undefined>).PASSIE_CRON_SECRET;
    }
  });

  it("returns 503 Service Unavailable when PASSIE_CRON_SECRET is not configured", async () => {
    delete (process.env as Record<string, string | undefined>).PASSIE_CRON_SECRET;

    const request = new Request("http://localhost/api/cron/ingest", {
      method: "POST",
      headers: {
        Authorization: "Bearer some-token",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("not configured");
  });

  it("returns 401 Unauthorized when Authorization header is missing or incorrect", async () => {
    process.env.PASSIE_CRON_SECRET = "super-secret-token";

    // Missing header
    const req1 = new Request("http://localhost/api/cron/ingest", {
      method: "POST",
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(401);
    const body1 = (await res1.json()) as { error: string };
    expect(body1.error).toBe("Unauthorized");

    // Invalid bearer
    const req2 = new Request("http://localhost/api/cron/ingest", {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-token",
      },
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(401);
  });

  it("returns 200 OK and runs ingestion when valid bearer token is provided", async () => {
    process.env.PASSIE_CRON_SECRET = "super-secret-token";

    const spy = vi.spyOn(ingestModule, "ingestClubFixtures").mockResolvedValue({
      clubSlug: "excelsior",
      totalParsed: 5,
      inserted: 2,
      updated: 1,
      cancelled: 0,
    });

    const request = new Request("http://localhost/api/cron/ingest", {
      method: "POST",
      headers: {
        Authorization: "Bearer super-secret-token",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      result: {
        clubSlug: string;
        totalParsed: number;
        inserted: number;
        updated: number;
        cancelled: number;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.result.inserted).toBe(2);
    expect(spy).toHaveBeenCalled();
  });
});
