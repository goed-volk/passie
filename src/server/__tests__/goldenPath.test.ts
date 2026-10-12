import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAuth } from "../auth";
import { createTestDb } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";
import { preCreateUserAndLink } from "../authAdmin";

describe("Golden path authentication flow tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;
  let testMemberId: string;
  const testEmail = "golden-path@example.com";

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;

    // Find an active member to link
    const member = await db.query.members.findFirst({
      where: eq(schema.members.slug, "bram"),
    });
    expect(member).toBeDefined();
    testMemberId = member!.id;

    // Pre-create user and link
    await preCreateUserAndLink(db, {
      memberId: testMemberId,
      email: testEmail,
      name: "Bram",
    });
  });

  afterAll(async () => {
    if (proxy) {
      await proxy.dispose();
    }
  });

  it("completes full OTP request -> sign in -> session verification -> revocation flow", async () => {
    const auth = await getAuth({ db });
    const ctx = (await (auth as any).$context) as {
      test: {
        getOTP: (email: string) => Promise<string>;
        login: (opts: { userId: string }) => Promise<{
          headers: Headers;
          user: { id: string };
        }>;
      };
    };

    // 1. Request OTP via email-otp endpoint
    const { getMailer, ConsoleMailer } = await import("../email");
    const mailer = getMailer() as InstanceType<typeof ConsoleMailer>;

    const otpReq = new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, type: "sign-in" }),
    });
    const otpRes = await auth.handler(otpReq);
    expect(otpRes.status).toBe(200);

    // 2. Retrieve sent 6-digit OTP from mailer
    const lastPayload = mailer.getLastPayload();
    expect(lastPayload).toBeDefined();
    const match = lastPayload?.text.match(/\b\d{6}\b/);
    expect(match).not.toBeNull();
    const otp = match![0];
    expect(otp.length).toBe(6);

    // 3. Sign in with OTP
    const signInReq = new Request("http://localhost:3000/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, otp }),
    });
    const signInRes = await auth.handler(signInReq);
    expect(signInRes.status).toBe(200);

    const setCookie = signInRes.headers.get("set-cookie");
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain("passie.session_token=");

    // Extract cookie
    const cookieHeader = setCookie!.split(";")[0];

    // 4. Verify session with getSession
    const sessionReq = new Request("http://localhost:3000/api/auth/get-session", {
      headers: { Cookie: cookieHeader! },
    });
    const sessionRes = await auth.handler(sessionReq);
    expect(sessionRes.status).toBe(200);
    const sessionData = (await sessionRes.json()) as { user: { email: string } };
    expect(sessionData.user.email).toBe(testEmail);

    // 5. Verify passkey options endpoints are reachable with session
    const pkRegReq = new Request("http://localhost:3000/api/auth/passkey/generate-register-options", {
      method: "GET",
      headers: {
        Cookie: cookieHeader!,
      },
    });
    const pkRegRes = await auth.handler(pkRegReq);
    expect(pkRegRes.status).toBe(200);
    const pkRegData = (await pkRegRes.json()) as { challenge: string };
    expect(pkRegData.challenge).toBeDefined();

    // 6. Sign out / revoke session
    const signOutReq = new Request("http://localhost:3000/api/auth/sign-out", {
      method: "POST",
      headers: { Cookie: cookieHeader! },
    });
    const signOutRes = await auth.handler(signOutReq);
    expect(signOutRes.status).toBe(200);

    // 7. Verify session is now invalidated
    const verifyRevokedReq = new Request("http://localhost:3000/api/auth/get-session", {
      headers: { Cookie: cookieHeader! },
    });
    const verifyRevokedRes = await auth.handler(verifyRevokedReq);
    expect(verifyRevokedRes.status).toBe(200);
    const emptySession = await verifyRevokedRes.json();
    expect(emptySession).toBeNull();
  });
});
