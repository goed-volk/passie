import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, setupIsolatedTestPool, cleanupTestPoolData } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import * as authSchema from "../authSchema";
import { eq, inArray } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";
import { mutate } from "../commit";
import { dispatchPassAssignedEmails } from "../email/lifecycle";
import { handleRemindPost } from "@/app/api/pool/[gamePoolId]/remind/route";

const mockGetActingMember = vi.fn();
vi.mock("@/server/actingMember", () => ({
  getActingMember: () => mockGetActingMember(),
}));

describe("lifecycle transactional email triggers & manual reminders", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;

  const fixtureId = "fix_test_lifecycle";
  const poolId = "pool_group_goedvolk_fix_test_lifecycle";

  const testClaimantEmail = "claimant-daan@goedvolk.org";
  const testOwnerEmail = "owner-bram@goedvolk.org";
  let claimantUserId: string;
  let ownerUserId: string;

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;

    // Clean up any test users left over from previous runs
    await db
      .update(schema.members)
      .set({ userId: null })
      .where(
        inArray(schema.members.id, [
          "member_goedvolk_daan",
          "member_goedvolk_bram",
        ])
      );
    await db
      .delete(authSchema.auth_user)
      .where(inArray(authSchema.auth_user.email, [testClaimantEmail, testOwnerEmail]));

    // Create / ensure auth_user records for Daan and Bram
    claimantUserId = crypto.randomUUID();
    ownerUserId = crypto.randomUUID();
    const now = new Date();

    await db.insert(authSchema.auth_user).values([
      {
        id: claimantUserId,
        email: testClaimantEmail,
        name: "Daan",
        emailVerified: true,
        role: "user",
        banned: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: ownerUserId,
        email: testOwnerEmail,
        name: "Bram",
        emailVerified: true,
        role: "user",
        banned: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Link users to members
    await db
      .update(schema.members)
      .set({ userId: claimantUserId })
      .where(eq(schema.members.id, "member_goedvolk_daan"));

    await db
      .update(schema.members)
      .set({ userId: ownerUserId })
      .where(eq(schema.members.id, "member_goedvolk_bram"));
  });

  afterAll(async () => {
    await cleanupTestPoolData(db, poolId, fixtureId);
    await db
      .update(schema.members)
      .set({ userId: null })
      .where(
        inArray(schema.members.id, [
          "member_goedvolk_daan",
          "member_goedvolk_bram",
        ])
      );
    await db
      .delete(authSchema.auth_user)
      .where(inArray(authSchema.auth_user.id, [claimantUserId, ownerUserId]));
    if (proxy) {
      await proxy.dispose();
    }
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockGetActingMember.mockReset();
    await setupIsolatedTestPool(db, poolId, fixtureId);
  });

  it("IndicateRelease with a waiting claimant dispatches pass_assigned email with match details", async () => {
    const mockSend = vi.fn().mockResolvedValue({ messageId: "msg_123" });
    const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = global.fetch;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const urlStr =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes("/capture/")) {
        fetchCalls.push({
          url: urlStr,
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        });
        return new Response(JSON.stringify({ status: 1 }), { status: 200 });
      }
      return originalFetch(input as RequestInfo, init);
    });

    try {
      // 1. Daan joins the queue
      const joinRes = await mutate(
        db,
        poolId,
        { type: "JoinQueue", nextEntryId: 0, kind: "self", guestName: null },
        "member_goedvolk_daan"
      );
      expect(joinRes.ok).toBe(true);

      // 2. Sam releases Pass 1 -> engine assigns Pass 1 to Daan
      const releaseRes = await mutate(
        db,
        poolId,
        { type: "IndicateRelease", passId: "pass_goedvolk_1" },
        "member_goedvolk_sam"
      );
      expect(releaseRes.ok).toBe(true);
      if (!releaseRes.ok) return;

      const assignedEvent = releaseRes.events.find((e) => e.type === "pass.assigned");
      expect(assignedEvent).toBeDefined();

      // 3. Dispatch lifecycle emails
      await dispatchPassAssignedEmails(db, poolId, releaseRes.events, {
        env: {
          PASSIE_ENV: "development",
          PASSIE_MAILER: "cloudflare",
          EMAIL: { send: mockSend },
          POSTHOG_KEY: "phc_test_lifecycle",
          POSTHOG_HOST: "https://eu.i.posthog.com",
        },
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const callPayload = mockSend.mock.calls[0]![0];
      expect(callPayload.to).toBe(testClaimantEmail);
      expect(callPayload.from).toEqual({ name: "Passie", email: "noreply@passie.goedvolk.org" });
      expect(callPayload.subject).toContain("Passie - Je bent erbij!");
      expect(callPayload.subject).toContain("Excelsior - Test FC");
      expect(callPayload.text).toContain("Hoi Daan,");
      expect(callPayload.text).toContain("Je stond op de bank");
      expect(callPayload.text).toContain("Pas 1");
      expect(callPayload.html).toContain("Je bent erbij!");
      expect(callPayload.html).toContain("Pas 1");

      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0]!.body.event).toBe("email.sent");
      expect(fetchCalls[0]!.body.properties).toEqual(
        expect.objectContaining({
          kind: "pass_assigned",
          trigger: "pool_mutation",
          provider: "cloudflare",
        })
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("JoinQueue when a pass is already released immediately triggers pass_assigned email", async () => {
    const mockSend = vi.fn().mockResolvedValue({ messageId: "msg_456" });

    // 1. Sam releases pass first
    const releaseRes = await mutate(
      db,
      poolId,
      { type: "IndicateRelease", passId: "pass_goedvolk_1" },
      "member_goedvolk_sam"
    );
    expect(releaseRes.ok).toBe(true);

    // 2. Daan joins queue -> immediately allocated
    const joinRes = await mutate(
      db,
      poolId,
      { type: "JoinQueue", nextEntryId: 0, kind: "guest", guestName: "Oom Kees" },
      "member_goedvolk_daan"
    );
    expect(joinRes.ok).toBe(true);
    if (!joinRes.ok) return;

    expect(joinRes.events.some((e) => e.type === "pass.assigned")).toBe(true);

    await dispatchPassAssignedEmails(db, poolId, joinRes.events, {
      env: {
        PASSIE_ENV: "development",
        PASSIE_MAILER: "cloudflare",
        EMAIL: { send: mockSend },
      },
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const payload = mockSend.mock.calls[0]![0];
    expect(payload.to).toBe(testClaimantEmail);
    expect(payload.subject).toContain("Pas toegewezen voor je gast bij Excelsior - Test FC");
    expect(payload.text).toContain("Oom Kees");
    expect(payload.html).toContain("Je gast is erbij!");
    expect(payload.html).toContain("Oom Kees");
  });

  it("idempotent replay of mutation returns empty events and does NOT send duplicate emails", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const key = `idempotent_${Date.now()}`;

    const res1 = await mutate(
      db,
      poolId,
      { type: "IndicateKeep", passId: "pass_goedvolk_1" },
      "member_goedvolk_sam",
      { idempotencyKey: key }
    );
    expect(res1.ok).toBe(true);

    const res2 = await mutate(
      db,
      poolId,
      { type: "IndicateKeep", passId: "pass_goedvolk_1" },
      "member_goedvolk_sam",
      { idempotencyKey: key }
    );
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.events).toEqual([]);
    }

    if (res2.ok) {
      await dispatchPassAssignedEmails(db, poolId, res2.events, {
        env: {
          PASSIE_ENV: "development",
          PASSIE_MAILER: "cloudflare",
          EMAIL: { send: mockSend },
        },
      });
    }

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("handleRemindPost gates access to admins only and rejects non-admin members with 403", async () => {
    mockGetActingMember.mockResolvedValue({
      id: "member_goedvolk_daan",
      role: "member",
      displayName: "Daan",
    });

    const req = new Request(`http://localhost:3000/api/pool/${poolId}/remind`, {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });

    const res = await handleRemindPost(req, poolId, db);
    expect(res.status).toBe(403);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe("FORBIDDEN");
  });

  it("handleRemindPost sends deadline reminders, deduplicates co-owners, skips unlinked owners, and records audit event", async () => {
    const mockSend = vi.fn().mockResolvedValue({ messageId: "remind_789" });
    const originalMailer = process.env.PASSIE_MAILER;
    process.env.PASSIE_MAILER = "cloudflare";

    // Set acting member as Bram (who has role: "admin")
    mockGetActingMember.mockResolvedValue({
      id: "member_goedvolk_bram",
      role: "admin",
      displayName: "Bram",
    });

    // Unlink Ilse so she is explicitly skipped
    const ilseMember = await db.query.members.findFirst({
      where: eq(schema.members.id, "member_goedvolk_ilse"),
    });
    const originalIlseUserId = ilseMember?.userId ?? null;
    await db
      .update(schema.members)
      .set({ userId: null })
      .where(eq(schema.members.id, "member_goedvolk_ilse"));

    const req = new Request(`http://localhost:3000/api/pool/${poolId}/remind`, {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });

    const emailModule = await import("../email/index");
    const mailerSpy = vi.spyOn(emailModule, "getMailer").mockReturnValue({
      send: mockSend,
    });

    try {
      const res = await handleRemindPost(req, poolId, db);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok: boolean; sentCount: number; skippedCount: number };
      expect(data.ok).toBe(true);
      expect(data.sentCount).toBeGreaterThanOrEqual(1);
      expect(data.skippedCount).toBeGreaterThanOrEqual(1); // Ilse was skipped

      expect(mockSend).toHaveBeenCalledTimes(data.sentCount);

      // Verify Bram received a deadline reminder email
      const bramCall = mockSend.mock.calls.find((c) => c[0].to === testOwnerEmail);
      expect(bramCall).toBeDefined();
      const payload = bramCall![0];
      expect(payload.from).toEqual({ name: "Passie", email: "noreply@passie.goedvolk.org" });
      expect(payload.subject).toContain("Passie - Laat weten of je gaat: Excelsior - Test FC");
      expect(payload.text).toContain("Hoi Bram,");
      expect(payload.text).toContain("Pas 3");
      expect(payload.html).toContain("Ga je naar Excelsior - Test FC?");

      // Verify audit event recorded in activity_events
      const auditEvent = await db.query.activityEvents.findFirst({
        where: eq(schema.activityEvents.type, "deadline.reminded"),
      });
      expect(auditEvent).toBeDefined();
      expect(auditEvent?.actorMemberId).toBe("member_goedvolk_bram");
      const auditPayload = JSON.parse(auditEvent!.payloadJson);
      expect(auditPayload.sentCount).toBe(data.sentCount);
      expect(auditPayload.skippedCount).toBe(data.skippedCount);
      expect(auditPayload.recipientMemberIds).toContain("member_goedvolk_bram");
    } finally {
      mailerSpy.mockRestore();
      process.env.PASSIE_MAILER = originalMailer;
      if (originalIlseUserId) {
        await db
          .update(schema.members)
          .set({ userId: originalIlseUserId })
          .where(eq(schema.members.id, "member_goedvolk_ilse"));
      }
    }
  });
});
