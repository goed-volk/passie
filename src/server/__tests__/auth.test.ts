import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { getAuth } from "../auth";
import { setBanned, preCreateUserAndLink } from "../authAdmin";
import { ConsoleMailer, CloudflareMailer, renderOtpEmail } from "../email";
import { createTestDb } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";

describe("Better Auth core, guards, disabledPaths & mailer tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;
  });

  afterAll(async () => {
    if (proxy) {
      await proxy.dispose();
    }
  });

  it("disabledPaths: unused core and email-otp paths return 404", async () => {
    const auth = await getAuth({ db });

    const disabledPathsToTest = [
      "/sign-up/email",
      "/sign-in/email",
      "/sign-in/social",
      "/request-password-reset",
      "/reset-password",
      "/verify-password",
      "/change-password",
      "/send-verification-email",
      "/verify-email",
      "/change-email",
      "/update-user",
      "/delete-user",
      "/email-otp/verify-email",
      "/email-otp/request-password-reset",
      "/email-otp/reset-password",
    ];

    for (const p of disabledPathsToTest) {
      const req = new Request(`http://localhost:3000/api/auth${p}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });
      const res = await auth.handler(req);
      expect(res.status, `Expected 404 for disabled path ${p}`).toBe(404);
    }
  });

  it("reachable paths: /api/auth/ok responds with 200", async () => {
    const auth = await getAuth({ db });
    const req = new Request("http://localhost:3000/api/auth/ok");
    const res = await auth.handler(req);
    expect(res.status).toBe(200);
  });

  it("guards: databaseHooks reject direct user creation through adapter", async () => {
    const auth = await getAuth({ db });
    const ctx = (await (auth as any).$context) as {
      internalAdapter: { createUser: (opts: { email: string; name: string }) => Promise<unknown> };
    };

    await expect(
      ctx.internalAdapter.createUser({
        email: "unauthorized@example.com",
        name: "Hacker",
      })
    ).rejects.toThrow();
  });

  it("setBanned: bans user and revokes all active sessions atomically", async () => {
    const testUserId = `user_ban_test_${Date.now()}`;
    const now = new Date();

    await db.insert(schema.auth_user).values({
      id: testUserId,
      email: `${testUserId}@example.com`,
      name: "Banned User",
      emailVerified: true,
      role: "user",
      banned: false,
      createdAt: now,
      updatedAt: now,
    });

    const auth = await getAuth({ db });
    const ctx = (await (auth as any).$context) as {
      test: { login: (opts: { userId: string }) => Promise<unknown> };
    };
    await ctx.test.login({ userId: testUserId });

    const sessionsBefore = await db.query.auth_session.findMany({
      where: eq(schema.auth_session.userId, testUserId),
    });
    expect(sessionsBefore.length).toBeGreaterThan(0);

    // Ban user
    await setBanned(db, testUserId, true);

    const userAfter = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.id, testUserId),
    });
    expect(userAfter?.banned).toBe(true);

    const sessionsAfter = await db.query.auth_session.findMany({
      where: eq(schema.auth_session.userId, testUserId),
    });
    expect(sessionsAfter.length).toBe(0);

    // Trying to create a new session for a banned user throws
    await expect(ctx.test.login({ userId: testUserId })).rejects.toThrow(
      "Account is suspended"
    );
  });

  it("mailers: ConsoleMailer logs and captures payload; CloudflareMailer delegates to binding", async () => {
    const consoleMailer = new ConsoleMailer();
    const payload = renderOtpEmail("test@example.com", "123456");

    expect(payload.to).toBe("test@example.com");
    expect(payload.text).toContain("123456");
    expect(payload.html).toContain("123456");

    await consoleMailer.send(payload);
    expect(consoleMailer.getLastPayload()).toEqual(payload);

    const mockSend = vi.fn().mockResolvedValue(undefined);
    const cfMailer = new CloudflareMailer({ send: mockSend }, "inloggen@passie.goedvolk.org");
    await cfMailer.send(payload);

    expect(mockSend).toHaveBeenCalledWith({
      to: "test@example.com",
      from: "inloggen@passie.goedvolk.org",
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  });

  it("dev login: /api/dev/login-as creates valid session and returns cookies for member", async () => {
    const { handleDevLogin } = await import("../../app/api/dev/login-as/route");

    const req = new Request("http://127.0.0.1:3000/api/dev/login-as", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memberSlug: "sam" }),
    });

    const res = await handleDevLogin(req, db);
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      ok: boolean;
      member: { slug: string };
      cookie: string;
    };
    expect(data.ok).toBe(true);
    expect(data.member.slug).toBe("sam");
    expect(data.cookie).toBeDefined();
    expect(data.cookie).toContain("passie.session_token=");
  });

  it("trustedOrigins: dynamic localhost ports are accepted and untrusted origins return 403", async () => {
    const auth = await getAuth({
      db,
      env: {
        PASSIE_ENV: "development",
        BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:*,http://127.0.0.1:*",
      },
    });

    // Request from a non-3000 localhost port
    const validDevReq = new Request("http://localhost:3467/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3467",
        Host: "localhost:3467",
      },
      body: JSON.stringify({ email: "demo@goedvolk.org", type: "sign-in" }),
    });
    const validRes = await auth.handler(validDevReq);
    expect(validRes.status).toBe(200);

    // Request from an untrusted external origin
    const untrustedReq = new Request("http://localhost:3467/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://malicious-attacker.com",
        Host: "localhost:3467",
      },
      body: JSON.stringify({ email: "demo@goedvolk.org", type: "sign-in" }),
    });
    const untrustedRes = await auth.handler(untrustedReq);
    expect(untrustedRes.status).toBe(403);
    const errBody = (await untrustedRes.json()) as { code: string };
    expect(errBody.code).toBe("INVALID_ORIGIN");
  });
});
