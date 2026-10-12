import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { getActingMemberId, getActingMember, requireActingMember } from "../actingMember";
import { createTestDb } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";
import { getAuth } from "../auth";

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

describe("actingMember session tests", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;
  let activeUserId: string;
  let unlinkedUserId: string;
  let activeHeaders: Headers;
  let unlinkedHeaders: Headers;

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;

    activeUserId = "user_acting_active";
    unlinkedUserId = "user_acting_unlinked";
    const now = new Date();

    const existingSam = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.email, "sam@example.com"),
    });

    if (existingSam) {
      activeUserId = existingSam.id;
    } else {
      activeUserId = "user_acting_active";
      await db.insert(schema.auth_user).values({
        id: activeUserId,
        email: "sam@example.com",
        name: "Sam",
        emailVerified: true,
        role: "admin",
        banned: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingOutsider = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.email, "outsider@example.com"),
    });

    if (existingOutsider) {
      unlinkedUserId = existingOutsider.id;
    } else {
      unlinkedUserId = "user_acting_unlinked";
      await db.insert(schema.auth_user).values({
        id: unlinkedUserId,
        email: "outsider@example.com",
        name: "Outsider",
        emailVerified: true,
        role: "user",
        banned: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db
      .update(schema.members)
      .set({ userId: activeUserId })
      .where(eq(schema.members.slug, "sam"));

    const auth = await getAuth({ db });
    const ctx = (await (auth as any).$context) as {
      test: { login: (opts: { userId: string }) => Promise<{ headers: Headers }> };
    };

    const activeLogin = await ctx.test.login({ userId: activeUserId });
    activeHeaders = activeLogin.headers;

    const unlinkedLogin = await ctx.test.login({ userId: unlinkedUserId });
    unlinkedHeaders = unlinkedLogin.headers;
  });

  afterAll(async () => {
    if (proxy) {
      await proxy.dispose();
    }
  });

  it("returns null when session is absent", async () => {
    const emptyHeaders = new Headers();
    const member = await getActingMember(db, emptyHeaders);
    expect(member).toBeNull();

    const memberId = await getActingMemberId(db, emptyHeaders);
    expect(memberId).toBeNull();
  });

  it("returns member reference when session is valid and linked to active member", async () => {
    const member = await getActingMember(db, activeHeaders);
    expect(member).not.toBeNull();
    expect(member?.displayName).toBe("Sam");
    expect(member?.email).toBe("sam@example.com");

    const memberId = await getActingMemberId(db, activeHeaders);
    expect(memberId).toBe(member?.id);

    const required = await requireActingMember(db, activeHeaders);
    expect(required.id).toBe(member?.id);
  });

  it("redirects to /inloggen when requireActingMember is called without session", async () => {
    const emptyHeaders = new Headers();
    await expect(requireActingMember(db, emptyHeaders)).rejects.toThrow(
      "NEXT_REDIRECT:/inloggen"
    );
  });

  it("redirects to /geen-toegang when user has no active group membership", async () => {
    await expect(requireActingMember(db, unlinkedHeaders)).rejects.toThrow(
      "NEXT_REDIRECT:/geen-toegang"
    );
  });
});
