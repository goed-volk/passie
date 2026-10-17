import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("posthog-js", () => {
  const mockPosthog = {
    __loaded: false,
    init: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
    identify: vi.fn(),
    group: vi.fn(),
    reset: vi.fn(),
    get_distinct_id: vi.fn(),
    get_property: vi.fn(),
    getGroups: vi.fn(() => ({})),
    register: vi.fn(),
  };
  return {
    default: mockPosthog,
    posthog: mockPosthog,
    __esModule: true,
  };
});

import {
  posthog,
  ALLOWED_ANALYTICS_EVENTS,
  initPostHog,
  trackMemberIdentity,
  identifyUser,
  trackMemberSelected,
  resetAnalytics,
  trackIndicateKeep,
  trackIndicateRelease,
  trackReclaim,
  trackQueueJoinSelf,
  trackQueueJoinGuest,
  trackQueueCancel,
  trackGiveBack,
  trackHandover,
  trackAdminLogin,
  trackAdminMemberCreated,
  trackAdminMemberUpdated,
  trackAdminMembersReordered,
  trackAdminDeadlineReminded,
  trackSignInOtpRequested,
  trackSignInOtpFailed,
  trackSignInSuccess,
  trackSignInFailed,
  trackSignOut,
  trackPasskeyRegistered,
  trackPasskeyDeleted,
  trackSessionsRevoked,
  trackClientException,
  getHoursToKickoffBucket,
} from "../posthog";

describe("posthog client telemetry & privacy", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    (posthog as unknown as { __loaded: boolean }).__loaded = false;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    // @ts-expect-error cleanup window mock
    delete globalThis.window;
  });

  describe("ALLOWED_ANALYTICS_EVENTS allowlist", () => {
    it("contains all core matchday, identity, navigation, admin, and error events", () => {
      // Core Matchday Lifecycle
      expect(ALLOWED_ANALYTICS_EVENTS.has("pass.indicate_keep")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("pass.indicate_release")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("pass.reclaim")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("queue.join_self")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("queue.join_guest")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("queue.cancel")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("pass.give_back")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("pass.handover")).toBe(true);

      // Identity & Navigation
      expect(ALLOWED_ANALYTICS_EVENTS.has("member.selected")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("auth.sign_in_otp_requested")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("auth.sign_in_otp_failed")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("auth.sign_in_success")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("auth.sign_in_failed")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("email.sent")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("email.send_failed")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("$pageview")).toBe(true);

      // Admin Administration
      expect(ALLOWED_ANALYTICS_EVENTS.has("admin.login")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("admin.member_created")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("admin.member_updated")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("admin.members_reordered")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("admin.deadline_reminded")).toBe(true);

      // Errors & Telemetry
      expect(ALLOWED_ANALYTICS_EVENTS.has("$exception")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("$identify")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("$set")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("$groupidentify")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("$web_vitals")).toBe(true);
      expect(ALLOWED_ANALYTICS_EVENTS.has("$performance_event")).toBe(true);

      // Autocapture & arbitrary events must be rejected
      expect(ALLOWED_ANALYTICS_EVENTS.has("$autocapture")).toBe(false);
      expect(ALLOWED_ANALYTICS_EVENTS.has("$click")).toBe(false);
      expect(ALLOWED_ANALYTICS_EVENTS.has("custom_leak")).toBe(false);
    });
  });

  describe("initPostHog() configuration & guarding", () => {
    it("does nothing if window is undefined (SSR)", () => {
      // @ts-expect-error ensure undefined
      delete globalThis.window;
      initPostHog({ posthogKey: "phc_test_key", posthogHost: "https://eu.i.posthog.com", passieEnv: "development" });
      expect(posthog.init).not.toHaveBeenCalled();
    });

    it("does nothing if already loaded", () => {
      globalThis.window = { location: { hostname: "passie.goedvolk.org" } } as unknown as Window & typeof globalThis;
      (posthog as unknown as { __loaded: boolean }).__loaded = true;
      initPostHog({ posthogKey: "phc_test_key", posthogHost: "https://eu.i.posthog.com", passieEnv: "development" });
      expect(posthog.init).not.toHaveBeenCalled();
    });

    it("does nothing if posthogKey is not set", () => {
      globalThis.window = { location: { hostname: "passie.goedvolk.org" } } as unknown as Window & typeof globalThis;
      initPostHog({ posthogKey: null, posthogHost: "https://eu.i.posthog.com", passieEnv: "development" });
      expect(posthog.init).not.toHaveBeenCalled();
    });

    it("does nothing on localhost in production mode", () => {
      globalThis.window = { location: { hostname: "localhost" } } as unknown as Window & typeof globalThis;
      initPostHog({ posthogKey: "phc_test_key", posthogHost: "https://eu.i.posthog.com", passieEnv: "production" });
      expect(posthog.init).not.toHaveBeenCalled();
    });

    it("initializes posthog with history_change pageview and security options on valid host", () => {
      globalThis.window = { location: { hostname: "passie.goedvolk.org" } } as unknown as Window & typeof globalThis;
      initPostHog({ posthogKey: "phc_test_key", posthogHost: "https://eu.i.posthog.com", passieEnv: "production" });

      expect(posthog.init).toHaveBeenCalledTimes(1);
      const firstCall = vi.mocked(posthog.init).mock.calls[0];
      expect(firstCall).toBeDefined();
      const [key, options] = firstCall!;
      expect(key).toBe("phc_test_key");
      expect(options?.api_host).toBe("/ingest");
      expect(options?.capture_pageview).toBe("history_change");
      expect(options?.autocapture).toBe(false);
      expect(options?.capture_heatmaps).toBe(false);
      expect(options?.disable_session_recording).toBe(true);
      expect(options?.person_profiles).toBe("identified_only");
      expect(options?.capture_exceptions).toEqual({
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: true,
      });
    });

    it("before_send filters out unlisted events", () => {
      globalThis.window = { location: { hostname: "passie.goedvolk.org" } } as unknown as Window & typeof globalThis;
      initPostHog({ posthogKey: "phc_test_key", posthogHost: "https://eu.i.posthog.com", passieEnv: "development" });

      const options = vi.mocked(posthog.init).mock.calls[0]![1];
      const beforeSend = options!.before_send as (event: unknown) => unknown;

      expect(beforeSend(null as never)).toBeNull();
      expect(beforeSend({ event: "$autocapture", properties: {} } as never)).toBeNull();
      expect(beforeSend({ event: "$click", properties: {} } as never)).toBeNull();
      expect(beforeSend({ event: "unknown.event", properties: {} } as never)).toBeNull();

      const allowedEvent = { event: "$pageview", properties: {} };
      expect(beforeSend(allowedEvent as never)).toEqual(allowedEvent);
    });

    it("before_send sanitizes URLs and strips PII fields", () => {
      globalThis.window = { location: { hostname: "passie.goedvolk.org" } } as unknown as Window & typeof globalThis;
      initPostHog({ posthogKey: "phc_test_key", posthogHost: "https://eu.i.posthog.com", passieEnv: "development" });

      const options = vi.mocked(posthog.init).mock.calls[0]![1];
      const beforeSend = options!.before_send as (event: unknown) => { properties: Record<string, unknown> } | null;

      const dirtyEvent = {
        event: "pass.indicate_keep",
        properties: {
          $current_url: "https://passie.goedvolk.org/pas/pass_123?tab=info#details",
          $pathname: "/pas/pass_123",
          guestName: "Secret Guest",
          displayName: "Secret Name",
          passId: "pass_123",
          seatInfo: "Vak K, Rij 4",
          email: "secret@example.com",
          safeProperty: "kept",
        },
      };

      const result = beforeSend(dirtyEvent as never);
      expect(result).not.toBeNull();
      expect(result?.properties.$current_url).toBe("https://passie.goedvolk.org/pas/[passId]");
      expect(result?.properties.$pathname).toBe("/pas/[passId]");
      expect(result?.properties.guestName).toBeUndefined();
      expect(result?.properties.displayName).toBeUndefined();
      expect(result?.properties.passId).toBeUndefined();
      expect(result?.properties.seatInfo).toBeUndefined();
      expect(result?.properties.email).toBeUndefined();
      expect(result?.properties.safeProperty).toBe("kept");
    });

    it("before_send sanitizes api pool paths", () => {
      globalThis.window = { location: { hostname: "passie.goedvolk.org" } } as unknown as Window & typeof globalThis;
      initPostHog({ posthogKey: "phc_test_key", posthogHost: "https://eu.i.posthog.com", passieEnv: "development" });

      const options = vi.mocked(posthog.init).mock.calls[0]![1];
      const beforeSend = options!.before_send as (event: unknown) => { properties: Record<string, unknown> } | null;

      const poolEvent = {
        event: "queue.join_self",
        properties: {
          $current_url: "https://passie.goedvolk.org/api/pool/pool_999?filter=all",
          $pathname: "/api/pool/pool_999",
        },
      };

      const result = beforeSend(poolEvent as never);
      expect(result?.properties.$current_url).toBe("https://passie.goedvolk.org/api/pool/[gamePoolId]");
      expect(result?.properties.$pathname).toBe("/api/pool/[gamePoolId]");
    });

    it("before_send sanitizes $exception_message and $exception_list values", () => {
      globalThis.window = { location: { hostname: "passie.goedvolk.org" } } as unknown as Window & typeof globalThis;
      initPostHog({ posthogKey: "phc_test_key", posthogHost: "https://eu.i.posthog.com", passieEnv: "development" });

      const options = vi.mocked(posthog.init).mock.calls[0]![1];
      const beforeSend = options!.before_send as (event: unknown) => { properties: Record<string, unknown> } | null;

      const exceptionEvent = {
        event: "$exception",
        properties: {
          $exception_message: "User 'Secret Person' with email user@example.com failed",
          $exception_list: [
            {
              type: "Error",
              value: 'Failed for "Secret Guest" (guest@example.com)',
            },
          ],
        },
      };

      const result = beforeSend(exceptionEvent as never);
      expect(result?.properties.$exception_message).toBe(
        "User '[redacted]' with email [email_redacted] failed"
      );
      expect(result?.properties.$exception_list).toEqual([
        {
          type: "Error",
          value: 'Failed for "[redacted]" ([email_redacted])',
        },
      ]);
    });
  });

  describe("trackMemberIdentity() lifecycle & hygiene", () => {
    beforeEach(() => {
      globalThis.window = {} as unknown as Window & typeof globalThis;
      (posthog as unknown as { __loaded: boolean }).__loaded = true;
    });

    it("first identify (anonymous state): calls identify without calling reset()", () => {
      vi.mocked(posthog.get_property).mockReturnValue("anonymous");
      vi.mocked(posthog.get_distinct_id).mockReturnValue("anon-uuid-123");
      vi.mocked(posthog.getGroups).mockReturnValue({});

      trackMemberIdentity({
        id: "mem_sam",
        slug: "sam",
        displayName: "Sam",
        isPassOwner: true,
        ownedPassCount: 1,
      });

      expect(posthog.reset).not.toHaveBeenCalled();
      expect(posthog.identify).toHaveBeenCalledTimes(1);
      expect(posthog.identify).toHaveBeenCalledWith(
        "mem_sam",
        expect.objectContaining({
          member_slug: "sam",
          display_name: "Sam",
          group_slug: "goedvolk",
          is_pass_owner: true,
          owned_pass_count: 1,
        }),
        expect.objectContaining({
          first_identified_at: expect.any(String),
        })
      );
      expect(posthog.group).toHaveBeenCalledWith("group", "goedvolk", { name: "Goed Volk" });
    });

    it("identity switch on shared device: calls reset() then identifies new member", () => {
      vi.mocked(posthog.get_property).mockReturnValue("identified");
      vi.mocked(posthog.get_distinct_id).mockReturnValue("mem_sam");
      vi.mocked(posthog.getGroups).mockReturnValue({ group: "goedvolk" });

      // After reset(), posthog state becomes unassigned
      vi.mocked(posthog.reset).mockImplementation(() => {
        vi.mocked(posthog.get_property).mockReturnValue("anonymous");
        vi.mocked(posthog.get_distinct_id).mockReturnValue("anon-fresh");
        vi.mocked(posthog.getGroups).mockReturnValue({});
      });

      trackMemberIdentity({
        id: "mem_noor",
        slug: "noor",
        displayName: "Noor",
        isPassOwner: false,
        ownedPassCount: 0,
      });

      expect(posthog.reset).toHaveBeenCalledTimes(1);
      expect(posthog.identify).toHaveBeenCalledTimes(1);
      expect(posthog.identify).toHaveBeenCalledWith(
        "mem_noor",
        expect.objectContaining({
          member_slug: "noor",
          display_name: "Noor",
          group_slug: "goedvolk",
          is_pass_owner: false,
          owned_pass_count: 0,
        }),
        expect.any(Object)
      );
      expect(posthog.group).toHaveBeenCalledWith("group", "goedvolk", { name: "Goed Volk" });
    });

    it("already identified as same member: skips identify() and group()", () => {
      vi.mocked(posthog.get_property).mockReturnValue("identified");
      vi.mocked(posthog.get_distinct_id).mockReturnValue("mem_sam");
      vi.mocked(posthog.getGroups).mockReturnValue({ group: "goedvolk" });

      trackMemberIdentity({
        id: "mem_sam",
        slug: "sam",
        displayName: "Sam",
        isPassOwner: true,
        ownedPassCount: 1,
      });

      expect(posthog.reset).not.toHaveBeenCalled();
      expect(posthog.identify).not.toHaveBeenCalled();
      expect(posthog.group).not.toHaveBeenCalled();
    });
  });

  describe("trackMemberSelected()", () => {
    beforeEach(() => {
      globalThis.window = {} as unknown as Window & typeof globalThis;
      (posthog as unknown as { __loaded: boolean }).__loaded = true;
    });

    it("captures member.selected with owner details and pass counts", () => {
      trackMemberSelected({
        id: "mem_ilse",
        slug: "ilse",
        displayName: "Ilse",
        isPassOwner: true,
        ownedPassCount: 2,
      });

      expect(posthog.capture).toHaveBeenCalledWith("member.selected", {
        is_pass_owner: true,
        owned_pass_count: 2,
      });
    });

    it("does nothing if posthog is not loaded", () => {
      (posthog as unknown as { __loaded: boolean }).__loaded = false;
      trackMemberSelected({
        id: "mem_ilse",
        slug: "ilse",
        displayName: "Ilse",
      });
      expect(posthog.capture).not.toHaveBeenCalled();
    });
  });

  describe("domain & admin capture helper functions", () => {
    beforeEach(() => {
      globalThis.window = {} as unknown as Window & typeof globalThis;
      (posthog as unknown as { __loaded: boolean }).__loaded = true;
    });

    it("captures admin actions", () => {
      trackAdminLogin();
      expect(posthog.capture).toHaveBeenCalledWith("admin.login");

      trackAdminMemberCreated();
      expect(posthog.capture).toHaveBeenCalledWith("admin.member_created");

      trackAdminMemberUpdated({ changed: ["displayName", "initials"] });
      expect(posthog.capture).toHaveBeenCalledWith("admin.member_updated", {
        changed: ["displayName", "initials"],
      });

      trackAdminMembersReordered({ memberCount: 6 });
      expect(posthog.capture).toHaveBeenCalledWith("admin.members_reordered", {
        memberCount: 6,
      });

      trackAdminDeadlineReminded({
        recipientCount: 3,
        skippedCount: 1,
        unindicatedPassCount: 4,
      });
      expect(posthog.capture).toHaveBeenCalledWith("admin.deadline_reminded", {
        recipientCount: 3,
        skippedCount: 1,
        unindicatedPassCount: 4,
      });
    });

    it("captures matchday domain events", () => {
      trackIndicateKeep({ hoursToKickoffBucket: ">72h", passCount: 1 });
      expect(posthog.capture).toHaveBeenCalledWith("pass.indicate_keep", {
        hoursToKickoffBucket: ">72h",
        passCount: 1,
      });

      trackIndicateRelease({ hoursToKickoffBucket: "24-48h" });
      expect(posthog.capture).toHaveBeenCalledWith("pass.indicate_release", {
        hoursToKickoffBucket: "24-48h",
      });

      trackReclaim({ hoursToKickoffBucket: "<6h" });
      expect(posthog.capture).toHaveBeenCalledWith("pass.reclaim", {
        hoursToKickoffBucket: "<6h",
      });

      trackQueueJoinSelf({ queueLengthBefore: 2 });
      expect(posthog.capture).toHaveBeenCalledWith("queue.join_self", {
        queueLengthBefore: 2,
      });

      trackQueueJoinGuest({ queueLengthBefore: 0 });
      expect(posthog.capture).toHaveBeenCalledWith("queue.join_guest", {
        queueLengthBefore: 0,
      });

      trackQueueCancel({ queuePosition: 1 });
      expect(posthog.capture).toHaveBeenCalledWith("queue.cancel", {
        queuePosition: 1,
      });

      trackGiveBack({ hoursToKickoffBucket: "6-24h" });
      expect(posthog.capture).toHaveBeenCalledWith("pass.give_back", {
        hoursToKickoffBucket: "6-24h",
      });

      trackHandover({ isHolderNow: true });
      expect(posthog.capture).toHaveBeenCalledWith("pass.handover", {
        isHolderNow: true,
      });

      // Authentication & Passkey events
      trackSignInOtpRequested();
      expect(posthog.capture).toHaveBeenCalledWith("auth.sign_in_otp_requested");

      trackSignInOtpFailed({ error_code: "INVALID_ORIGIN", status: 403 });
      expect(posthog.capture).toHaveBeenCalledWith("auth.sign_in_otp_failed", {
        error_code: "INVALID_ORIGIN",
        status: 403,
      });

      trackSignInSuccess({ method: "otp" });
      expect(posthog.capture).toHaveBeenCalledWith("auth.sign_in_success", {
        method: "otp",
      });

      trackSignInFailed({
        method: "otp",
        error_code: "TOO_MANY_ATTEMPTS",
        status: 400,
      });
      expect(posthog.capture).toHaveBeenCalledWith("auth.sign_in_failed", {
        method: "otp",
        error_code: "TOO_MANY_ATTEMPTS",
        status: 400,
      });

      trackSignInSuccess({ method: "passkey" });
      expect(posthog.capture).toHaveBeenCalledWith("auth.sign_in_success", {
        method: "passkey",
      });

      trackSignOut();
      expect(posthog.capture).toHaveBeenCalledWith("auth.sign_out");

      trackPasskeyRegistered();
      expect(posthog.capture).toHaveBeenCalledWith("auth.passkey_registered");

      trackPasskeyDeleted();
      expect(posthog.capture).toHaveBeenCalledWith("auth.passkey_deleted");

      trackSessionsRevoked();
      expect(posthog.capture).toHaveBeenCalledWith("auth.sessions_revoked");

      const err = new Error("Render crash");
      trackClientException(err, { boundary: "app_error_boundary" });
      expect(posthog.captureException).toHaveBeenCalledWith(err, {
        boundary: "app_error_boundary",
      });
    });

    it("resets analytics on resetAnalytics()", () => {
      resetAnalytics();
      expect(posthog.reset).toHaveBeenCalledTimes(1);
    });
  });

  describe("identifyUser() lifecycle & reset guard", () => {
    beforeEach(() => {
      globalThis.window = {} as unknown as Window & typeof globalThis;
      (posthog as unknown as { __loaded: boolean }).__loaded = true;
    });

    it("calls reset() when switching from an already-identified distinct ID", () => {
      vi.mocked(posthog.get_property).mockReturnValue("identified");
      vi.mocked(posthog.get_distinct_id).mockReturnValue("mem_sam");

      vi.mocked(posthog.reset).mockImplementation(() => {
        vi.mocked(posthog.get_property).mockReturnValue("anonymous");
        vi.mocked(posthog.get_distinct_id).mockReturnValue("anon-fresh");
      });

      identifyUser("mem_noor");

      expect(posthog.reset).toHaveBeenCalledTimes(1);
      expect(posthog.identify).toHaveBeenCalledWith("mem_noor");
    });

    it("does not call reset() when in anonymous state", () => {
      vi.mocked(posthog.get_property).mockReturnValue("anonymous");
      vi.mocked(posthog.get_distinct_id).mockReturnValue("anon-uuid-123");

      identifyUser("mem_sam");

      expect(posthog.reset).not.toHaveBeenCalled();
      expect(posthog.identify).toHaveBeenCalledWith("mem_sam");
    });

    it("skips identify() if distinct_id already matches", () => {
      vi.mocked(posthog.get_property).mockReturnValue("identified");
      vi.mocked(posthog.get_distinct_id).mockReturnValue("mem_sam");

      identifyUser("mem_sam");

      expect(posthog.reset).not.toHaveBeenCalled();
      expect(posthog.identify).not.toHaveBeenCalled();
    });

    it("does nothing if posthog is not loaded", () => {
      (posthog as unknown as { __loaded: boolean }).__loaded = false;

      identifyUser("mem_sam");

      expect(posthog.reset).not.toHaveBeenCalled();
      expect(posthog.identify).not.toHaveBeenCalled();
    });
  });

  describe("getHoursToKickoffBucket()", () => {
    it("handles null or undefined kickoff", () => {
      expect(getHoursToKickoffBucket(null)).toBe("unknown");
      expect(getHoursToKickoffBucket(undefined)).toBe("unknown");
    });

    it("buckets past, near, and future kickoff timestamps accurately", () => {
      const nowSec = Math.floor(Date.now() / 1000);

      expect(getHoursToKickoffBucket(nowSec - 3600)).toBe("post_kickoff");
      expect(getHoursToKickoffBucket(nowSec + 3600 * 2)).toBe("<6h");
      expect(getHoursToKickoffBucket(nowSec + 3600 * 12)).toBe("6-24h");
      expect(getHoursToKickoffBucket(nowSec + 3600 * 36)).toBe("24-48h");
      expect(getHoursToKickoffBucket(nowSec + 3600 * 60)).toBe("48-72h");
      expect(getHoursToKickoffBucket(nowSec + 3600 * 100)).toBe(">72h");
    });
  });
});
