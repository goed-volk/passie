import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { getActingMemberId, getActingMember, requireActingMember, COOKIE_NAME } from "../actingMember";
import { createTestDb } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";

// Mock next/headers
const mockGetCookie = vi.fn();
const mockDeleteCookie = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockGetCookie,
    delete: mockDeleteCookie,
  }),
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

describe("actingMember tests", () => {
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

  beforeEach(() => {
    mockGetCookie.mockReset();
    mockDeleteCookie.mockReset();
    mockRedirect.mockReset();
  });

  it("returns null when cookie is absent", async () => {
    mockGetCookie.mockReturnValue(undefined);

    const memberId = await getActingMemberId();
    expect(memberId).toBeNull();

    const member = await getActingMember(db);
    expect(member).toBeNull();
  });

  it("returns member reference when cookie is set to an active member", async () => {
    mockGetCookie.mockImplementation((name: string) => {
      if (name === COOKIE_NAME) {
        return { name: COOKIE_NAME, value: "member_goedvolk_sam" };
      }
      return undefined;
    });

    const memberId = await getActingMemberId();
    expect(memberId).toBe("member_goedvolk_sam");

    const member = await getActingMember(db);
    expect(member).not.toBeNull();
    expect(member?.id).toBe("member_goedvolk_sam");
    expect(member?.displayName).toBe("Sam");
    expect(member?.slug).toBe("sam");
    expect(member?.avatarColor).toBe("#E30613");

    const required = await requireActingMember(db);
    expect(required.id).toBe("member_goedvolk_sam");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns null and redirects to /wie-ben-jij when member does not exist in DB", async () => {
    mockGetCookie.mockImplementation((name: string) => {
      if (name === COOKIE_NAME) {
        return { name: COOKIE_NAME, value: "member_non_existent" };
      }
      return undefined;
    });

    const member = await getActingMember(db);
    expect(member).toBeNull();

    await expect(requireActingMember(db)).rejects.toThrow("NEXT_REDIRECT:/wie-ben-jij");
    expect(mockRedirect).toHaveBeenCalledWith("/wie-ben-jij");
    expect(mockDeleteCookie).toHaveBeenCalledWith(COOKIE_NAME);
  });

  it("returns null and redirects to /wie-ben-jij when member exists but isActive is 0", async () => {
    const inactiveMemberId = "member_goedvolk_inactive_test";
    const now = Math.floor(Date.now() / 1000);

    await db
      .insert(schema.members)
      .values({
        id: inactiveMemberId,
        groupId: "group_goedvolk",
        slug: "inactive_user",
        displayName: "Inactive User",
        initials: "IU",
        avatarColor: "#999999",
        isActive: 0,
        sortOrder: 99,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.members.groupId, schema.members.slug],
        set: { isActive: 0 },
      });

    mockGetCookie.mockImplementation((name: string) => {
      if (name === COOKIE_NAME) {
        return { name: COOKIE_NAME, value: inactiveMemberId };
      }
      return undefined;
    });

    const member = await getActingMember(db);
    expect(member).toBeNull();

    await expect(requireActingMember(db)).rejects.toThrow("NEXT_REDIRECT:/wie-ben-jij");
    expect(mockRedirect).toHaveBeenCalledWith("/wie-ben-jij");

    // Clean up
    await db.delete(schema.members).where(eq(schema.members.id, inactiveMemberId));
  });
});
