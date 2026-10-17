import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./helpers/testDb";
import type { DbClient } from "../db";
import * as schema from "../schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { PlatformProxy } from "wrangler";
import {
  createMember,
  updateMember,
  reorderMembers,
  assertDeactivatable,
  deriveSlug,
  deriveInitials,
  listAdminMembers,
  resolveAdminGroup,
  type MemberUpdatableField,
} from "../adminMembers";
import type { AdminPrincipal } from "../adminAuth";

describe("adminMembers", () => {
  let proxy: PlatformProxy<{ DB: D1Database }>;
  let db: DbClient;
  const createdMemberIds: string[] = [];
  const createdUserEmails: string[] = [];

  const principal: AdminPrincipal = {
    subject: "shared",
    memberId: null,
    email: "admin@example.com",
    role: "group_admin",
  };

  beforeAll(async () => {
    const res = await createTestDb();
    proxy = res.proxy;
    db = res.db;
  });

  afterAll(async () => {
    // Clean up created test members and their specific audit events
    if (createdMemberIds.length > 0 && db) {
      for (const id of createdMemberIds) {
        await db.delete(schema.activityEvents).where(sql`${schema.activityEvents.payloadJson} LIKE ${`%"memberId":"${id}"%`}`);
      }
      await db.delete(schema.members).where(inArray(schema.members.id, createdMemberIds));
    }
    if (createdUserEmails.length > 0 && db) {
      await db.delete(schema.auth_user).where(inArray(schema.auth_user.email, createdUserEmails));
    }
    if (proxy) {
      await proxy.dispose();
    }
  });

  it("resolves the single admin group", async () => {
    const group = await resolveAdminGroup(db);
    expect(group).not.toBeNull();
    expect(group.slug).toBe("goedvolk");
  });

  it("derives initials correctly", () => {
    expect(deriveInitials("Bram")).toBe("B");
    expect(deriveInitials(" anne-marie ")).toBe("A");
    expect(deriveInitials("")).toBe("L");
  });

  it("derives slugs correctly with collision suffixing", async () => {
    const group = await resolveAdminGroup(db);
    const slug1 = await deriveSlug(db, group.id, "Nieuwe Gebruiker");
    expect(slug1).toBe("nieuwe-gebruiker");

    // Insert a member with this slug
    const m1 = await createMember(
      db,
      group.id,
      { displayName: "Nieuwe Gebruiker", avatarColor: "#3B82F6" },
      principal
    );
    createdMemberIds.push(m1.id);
    expect(m1.id).toBe("member_goedvolk_nieuwe-gebruiker");
    expect(m1.slug).toBe("nieuwe-gebruiker");
    expect(m1.initials).toBe("N");

    // Next collision should get -2
    const slug2 = await deriveSlug(db, group.id, "Nieuwe Gebruiker");
    expect(slug2).toBe("nieuwe-gebruiker-2");

    // Insert member with -2
    const m2 = await createMember(
      db,
      group.id,
      { displayName: "Nieuwe Gebruiker", avatarColor: "#10B981" },
      principal
    );
    createdMemberIds.push(m2.id);
    expect(m2.slug).toBe("nieuwe-gebruiker-2");

    // Third collision should get -3
    const slug3 = await deriveSlug(db, group.id, "Nieuwe Gebruiker");
    expect(slug3).toBe("nieuwe-gebruiker-3");
  });

  it("lists members including ownership and possession cards", async () => {
    const group = await resolveAdminGroup(db);
    const members = await listAdminMembers(db, group.id);
    expect(members.length).toBeGreaterThan(0);

    const sam = members.find((m) => m.slug === "sam");
    expect(sam).toBeDefined();
    expect(sam?.ownedPassLabels).toContain("Pas 1");
  });

  it("picks distinct avatar colors automatically when not provided", async () => {
    const group = await resolveAdminGroup(db);
    const m = await createMember(
      db,
      group.id,
      { displayName: "Auto Color Member" },
      principal
    );
    createdMemberIds.push(m.id);
    expect(m.avatarColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("creates a passless member and verifies audit row in activity_events", async () => {
    const group = await resolveAdminGroup(db);
    const newMember = await createMember(
      db,
      group.id,
      {
        displayName: "Guest Member",
        initials: "GM",
        avatarColor: "#10B981",
        sortOrder: 50,
      },
      principal
    );
    createdMemberIds.push(newMember.id);

    expect(newMember.id).toBe("member_goedvolk_guest-member");
    expect(newMember.displayName).toBe("Guest Member");
    expect(newMember.initials).toBe("GM");
    expect(newMember.sortOrder).toBe(50);

    // Verify audit event
    const auditEvent = await db.query.activityEvents.findFirst({
      where: eq(schema.activityEvents.id, `evt_member_created_${newMember.id}_${newMember.createdAt}`),
    });
    expect(auditEvent).toBeDefined();
    expect(auditEvent?.gamePoolId).toBeNull();
    expect(auditEvent?.actorMemberId).toBeNull(); // null for shared admin
    expect(auditEvent?.type).toBe("member.created");

    const payload = JSON.parse(auditEvent!.payloadJson);
    expect(payload.actor).toBe("shared");
    expect(payload.memberId).toBe(newMember.id);
  });

  it("reorders members sequentially and creates audit log", async () => {
    const group = await resolveAdminGroup(db);
    const members = await listAdminMembers(db, group.id);
    const originalIds = members.map((m) => m.id);

    // Swap first two members
    const reorderedIds = [...originalIds];
    const [first, second] = [reorderedIds[0]!, reorderedIds[1]!];
    reorderedIds[0] = second;
    reorderedIds[1] = first;

    const reorderRes = await reorderMembers(db, group.id, reorderedIds, principal);
    expect(reorderRes.ok).toBe(true);

    const firstMember = await db.query.members.findFirst({
      where: eq(schema.members.id, second),
    });
    expect(firstMember?.sortOrder).toBe(1);

    const secondMember = await db.query.members.findFirst({
      where: eq(schema.members.id, first),
    });
    expect(secondMember?.sortOrder).toBe(2);

    // Restore original ordering to keep shared local D1 clean
    await reorderMembers(db, group.id, originalIds, principal);
  });

  it("updates allowed fields and ignores fields outside the allowlist", async () => {
    const group = await resolveAdminGroup(db);
    const member = await createMember(
      db,
      group.id,
      { displayName: "Editable User", avatarColor: "#6366F1" },
      principal
    );
    createdMemberIds.push(member.id);

    // Self-service allowlist simulation: only displayName and avatarColor
    const selfServiceAllowed: MemberUpdatableField[] = ["displayName", "avatarColor"];
    const updateRes = await updateMember(
      db,
      member.id,
      {
        displayName: "Editable User Renamed",
        avatarColor: "#EC4899",
        sortOrder: 999, // Should be ignored
        isActive: 0, // Should be ignored
      },
      selfServiceAllowed,
      principal
    );

    expect(updateRes.ok).toBe(true);
    if (updateRes.ok) {
      expect(updateRes.member.displayName).toBe("Editable User Renamed");
      expect(updateRes.member.avatarColor).toBe("#EC4899");
      expect(updateRes.member.sortOrder).toBe(member.sortOrder); // not changed
      expect(updateRes.member.isActive).toBe(1); // not changed
      expect(updateRes.changed).toEqual(["displayName", "avatarColor"]);
    }
  });

  describe("assertDeactivatable blocking rules", () => {
    it("blocks deactivation when member is a pass owner", async () => {
      // Find a known owner who does not hold a pass (Noor owns Pas 2, Ilse holds it)
      const noor = await db.query.members.findFirst({
        where: eq(schema.members.slug, "noor"),
      });
      expect(noor).toBeDefined();

      const result = await assertDeactivatable(db, noor!.id);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("is_owner");
      }
    });

    it("blocks deactivation when member currently holds a physical card", async () => {
      const group = await resolveAdminGroup(db);
      const holder = await createMember(
        db,
        group.id,
        { displayName: "Card Holder", avatarColor: "#06B6D4" },
        principal
      );
      createdMemberIds.push(holder.id);

      // Temporarily assign holder to a pass
      const pass = await db.query.passes.findFirst();
      const originalHolder = pass!.holderMemberId;

      await db.update(schema.passes).set({ holderMemberId: holder.id }).where(eq(schema.passes.id, pass!.id));

      const result = await assertDeactivatable(db, holder.id);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("holds_pass");
      }

      // Restore holder
      await db.update(schema.passes).set({ holderMemberId: originalHolder }).where(eq(schema.passes.id, pass!.id));
    });

    it("allows deactivation when member is a clean passless member without obligations", async () => {
      const group = await resolveAdminGroup(db);
      const cleanMember = await createMember(
        db,
        group.id,
        { displayName: "Clean Passless", avatarColor: "#8B5CF6" },
        principal
      );
      createdMemberIds.push(cleanMember.id);

      const result = await assertDeactivatable(db, cleanMember.id);
      expect(result.ok).toBe(true);

      const adminAllowed: MemberUpdatableField[] = ["displayName", "initials", "avatarColor", "sortOrder", "isActive"];
      const deactivateRes = await updateMember(db, cleanMember.id, { isActive: 0 }, adminAllowed, principal);
      expect(deactivateRes.ok).toBe(true);
      if (deactivateRes.ok) {
        expect(deactivateRes.member.isActive).toBe(0);
      }
    });
  });

  describe("welcome email hook on member creation and first-time email linking", () => {
    const adminAllowed: MemberUpdatableField[] = [
      "displayName",
      "initials",
      "avatarColor",
      "sortOrder",
      "isActive",
      "email",
      "role",
    ];

    it("createMember with an email dispatches welcome email and emits email.sent with zero PII", async () => {
      const group = await resolveAdminGroup(db);
      const mockSend = vi.fn().mockResolvedValue(undefined);
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

      const testEmail = `welkom-create-${Date.now()}@goedvolk.org`;
      createdUserEmails.push(testEmail);

      try {
        const member = await createMember(
          db,
          group.id,
          {
            displayName: "Welkom Lid",
            email: testEmail,
            avatarColor: "#10B981",
          },
          principal,
          {
            env: {
              PASSIE_ENV: "development",
              PASSIE_MAILER: "cloudflare",
              PASSIE_PUBLIC_ORIGIN: "https://passie.goedvolk.org",
              EMAIL: { send: mockSend },
              POSTHOG_KEY: "phc_test_welcome",
              POSTHOG_HOST: "https://eu.i.posthog.com",
            },
          }
        );
        createdMemberIds.push(member.id);

        expect(mockSend).toHaveBeenCalledTimes(1);
        const sentMessage = mockSend.mock.calls[0]![0];
        expect(sentMessage.to).toBe(testEmail);
        expect(sentMessage.subject).toContain("Je bent toegevoegd aan Passie");
        expect(sentMessage.html).toContain("Hoi Welkom Lid,");
        expect(sentMessage.html).toContain("https://passie.goedvolk.org/inloggen");
        expect(sentMessage.text).toContain("https://passie.goedvolk.org/inloggen");

        expect(fetchCalls.length).toBe(1);
        const captured = fetchCalls[0]!.body;
        expect(captured.event).toBe("email.sent");
        expect(captured.distinct_id).toBe(member.id);
        expect(captured.properties).toEqual(
          expect.objectContaining({
            kind: "welcome",
            trigger: "member_created",
            provider: "cloudflare",
            $geoip_disable: true,
            $process_person_profile: true,
          })
        );
        const propsJson = JSON.stringify(captured.properties);
        expect(propsJson).not.toContain(testEmail);
        expect(propsJson).not.toContain("Welkom Lid");
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("createMember without an email does NOT dispatch a welcome email", async () => {
      const group = await resolveAdminGroup(db);
      const mockSend = vi.fn().mockResolvedValue(undefined);

      const member = await createMember(
        db,
        group.id,
        {
          displayName: "Zonder Email Lid",
          avatarColor: "#6366F1",
        },
        principal,
        {
          env: {
            PASSIE_ENV: "development",
            PASSIE_MAILER: "cloudflare",
            EMAIL: { send: mockSend },
          },
        }
      );
      createdMemberIds.push(member.id);

      expect(mockSend).not.toHaveBeenCalled();
    });

    it("updateMember linking an email to an unlinked member dispatches welcome email once, and skips on subsequent updates", async () => {
      const group = await resolveAdminGroup(db);
      const mockSend = vi.fn().mockResolvedValue(undefined);
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

      const testEmail = `welkom-link-${Date.now()}@goedvolk.org`;
      const secondEmail = `welkom-change-${Date.now()}@goedvolk.org`;
      createdUserEmails.push(testEmail, secondEmail);

      try {
        // 1. Create member without email
        const member = await createMember(
          db,
          group.id,
          { displayName: "Later Gekoppeld" },
          principal,
          {
            env: {
              PASSIE_ENV: "development",
              PASSIE_MAILER: "cloudflare",
              EMAIL: { send: mockSend },
            },
          }
        );
        createdMemberIds.push(member.id);
        expect(mockSend).not.toHaveBeenCalled();

        // 2. Link email for the first time via updateMember -> SHOULD send welcome email
        const linkRes = await updateMember(
          db,
          member.id,
          { email: testEmail },
          adminAllowed,
          principal,
          {
            env: {
              PASSIE_ENV: "development",
              PASSIE_MAILER: "cloudflare",
              EMAIL: { send: mockSend },
              POSTHOG_KEY: "phc_test_welcome",
              POSTHOG_HOST: "https://eu.i.posthog.com",
            },
          }
        );
        expect(linkRes.ok).toBe(true);
        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(mockSend.mock.calls[0]![0].to).toBe(testEmail);
        expect(fetchCalls.length).toBe(1);
        expect(fetchCalls[0]!.body.event).toBe("email.sent");
        expect(fetchCalls[0]!.body.properties).toEqual(
          expect.objectContaining({
            kind: "welcome",
            trigger: "member_email_linked",
            provider: "cloudflare",
          })
        );

        // 3. Update displayName or re-submit same email -> should NOT send another welcome email
        await updateMember(
          db,
          member.id,
          { displayName: "Later Gekoppeld Hernoemd", email: testEmail },
          adminAllowed,
          principal,
          {
            env: {
              PASSIE_ENV: "development",
              PASSIE_MAILER: "cloudflare",
              EMAIL: { send: mockSend },
            },
          }
        );
        expect(mockSend).toHaveBeenCalledTimes(1);

        // 4. Changing an already-linked member's email address -> should NOT trigger first-time welcome email
        await updateMember(
          db,
          member.id,
          { email: secondEmail },
          adminAllowed,
          principal,
          {
            env: {
              PASSIE_ENV: "development",
              PASSIE_MAILER: "cloudflare",
              EMAIL: { send: mockSend },
            },
          }
        );
        expect(mockSend).toHaveBeenCalledTimes(1);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("mailer failure during welcome email dispatch emits email.send_failed + $exception without failing member creation or leaking email PII", async () => {
      const group = await resolveAdminGroup(db);
      const failingSend = vi
        .fn()
        .mockRejectedValue(new Error("SMTP rejected recipient SecretUser@goedvolk.org"));
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

      const testEmail = `fail-welcome-${Date.now()}@goedvolk.org`;
      createdUserEmails.push(testEmail);

      try {
        const member = await createMember(
          db,
          group.id,
          {
            displayName: "Foutbij Mail",
            email: testEmail,
          },
          principal,
          {
            env: {
              PASSIE_ENV: "development",
              PASSIE_MAILER: "cloudflare",
              EMAIL: { send: failingSend },
              POSTHOG_KEY: "phc_test_welcome_fail",
              POSTHOG_HOST: "https://eu.i.posthog.com",
            },
          }
        );
        createdMemberIds.push(member.id);

        // Member is still created in DB despite email failure
        const dbMember = await db.query.members.findFirst({
          where: eq(schema.members.id, member.id),
        });
        expect(dbMember).toBeDefined();

        expect(fetchCalls.length).toBe(2);
        const failedEvt = fetchCalls.find((c) => c.body.event === "email.send_failed");
        const exceptionEvt = fetchCalls.find((c) => c.body.event === "$exception");

        expect(failedEvt).toBeDefined();
        expect(failedEvt!.body.distinct_id).toBe(member.id);
        expect(failedEvt!.body.properties).toEqual(
          expect.objectContaining({
            kind: "welcome",
            trigger: "member_created",
            provider: "cloudflare",
          })
        );

        expect(exceptionEvt).toBeDefined();
        const allTelemetryJson = JSON.stringify(fetchCalls);
        expect(allTelemetryJson).not.toContain(testEmail);
        expect(allTelemetryJson).not.toContain("SecretUser@goedvolk.org");
        expect(allTelemetryJson).toContain("[email_redacted]");
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
