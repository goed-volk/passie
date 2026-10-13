import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { getAdminPrincipal, requireAdminSession, requireAdminApi, assertCapability } from "../adminAuth";
import { createTestDb } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";
import { getAuth } from "../auth";

// Mock next/navigation
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

describe("adminAuth tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;
  let adminUserId: string;
  let regularUserId: string;
  let adminHeaders: Headers;
  let regularHeaders: Headers;

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;

    // Create admin user and link to member_goedvolk_sam (who has role: admin)
    const now = new Date();
    const existingSam = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.email, "demo@goedvolk.org"),
    });

    if (existingSam) {
      adminUserId = existingSam.id;
      await db
        .update(schema.auth_user)
        .set({ role: "admin" })
        .where(eq(schema.auth_user.id, adminUserId));
    } else {
      adminUserId = "user_admin_test";
      await db.insert(schema.auth_user).values({
        id: adminUserId,
        email: "demo@goedvolk.org",
        name: "Sam",
        emailVerified: true,
        role: "admin",
        banned: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db
      .update(schema.members)
      .set({ userId: adminUserId, role: "admin" })
      .where(eq(schema.members.slug, "sam"));

    const existingDaan = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.email, "daan@goedvolk.org"),
    });

    if (existingDaan) {
      regularUserId = existingDaan.id;
      await db
        .update(schema.auth_user)
        .set({ role: "user" })
        .where(eq(schema.auth_user.id, regularUserId));
    } else {
      regularUserId = "user_regular_test";
      await db.insert(schema.auth_user).values({
        id: regularUserId,
        email: "daan@goedvolk.org",
        name: "Daan",
        emailVerified: true,
        role: "user",
        banned: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db
      .update(schema.members)
      .set({ userId: regularUserId, role: "member" })
      .where(eq(schema.members.slug, "daan"));

    const auth = await getAuth({ db });
    const ctx = (await (auth as any).$context) as {
      test: { login: (opts: { userId: string }) => Promise<{ headers: Headers }> };
    };

    const adminLogin = await ctx.test.login({ userId: adminUserId });
    adminHeaders = adminLogin.headers;

    const regularLogin = await ctx.test.login({ userId: regularUserId });
    regularHeaders = regularLogin.headers;
  });

  afterAll(async () => {
    if (proxy) {
      await proxy.dispose();
    }
  });

  it("returns null when no session is present", async () => {
    const emptyHeaders = new Headers();
    const principal = await getAdminPrincipal(db, emptyHeaders);
    expect(principal).toBeNull();
  });

  it("returns null when regular non-admin user is logged in", async () => {
    const principal = await getAdminPrincipal(db, regularHeaders);
    expect(principal).toBeNull();
  });

  it("returns principal when admin user is logged in", async () => {
    const principal = await getAdminPrincipal(db, adminHeaders);
    expect(principal).not.toBeNull();
    expect(principal?.email).toBe("demo@goedvolk.org");
    expect(principal?.role).toBe("platform_admin");
  });

  it("assertCapability checks capabilities correctly", () => {
    const principal = {
      subject: "test",
      memberId: "m1",
      email: "demo@goedvolk.org",
      role: "group_admin" as const,
    };
    expect(assertCapability(principal, "members.read")).toBe(true);
    expect(assertCapability(principal, "members.write")).toBe(true);
  });
});
