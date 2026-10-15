import posthog from "posthog-js";

export const ALLOWED_ANALYTICS_EVENTS = new Set([
  // Core Matchday Lifecycle
  "pass.indicate_keep",
  "pass.indicate_release",
  "pass.reclaim",
  "queue.join_self",
  "queue.join_guest",
  "queue.cancel",
  "pass.give_back",
  "pass.handover",

  // Identity & Navigation
  "member.selected",
  "auth.sign_in_otp_requested",
  "auth.sign_in_success",
  "auth.sign_out",
  "auth.passkey_registered",
  "auth.passkey_deleted",
  "auth.sessions_revoked",
  "email.sent",
  "email.send_failed",
  "$pageview",

  // Admin Administration
  "admin.login",
  "admin.member_created",
  "admin.member_updated",
  "admin.members_reordered",

  // Errors & Internal Metrics
  "$exception",
  "$identify",
  "$set",
  "$groupidentify",
  "$web_vitals",
  "$performance_event",
]);

export interface ClientTelemetryConfig {
  posthogKey: string | null;
  posthogHost: string;
  passieEnv: string;
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, "https://passie.goedvolk.org");
    const path = url.pathname;
    let templatePath = path;
    if (path.startsWith("/pas/")) {
      templatePath = "/pas/[passId]";
    } else if (path.startsWith("/api/pool/")) {
      templatePath = "/api/pool/[gamePoolId]";
    }
    url.pathname = templatePath;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function sanitizeExceptionText(raw: string): string {
  return raw
    .replace(/'[^']*'/g, "'[redacted]'")
    .replace(/"[^"]*"/g, '"[redacted]"')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email_redacted]");
}

function sanitizePathname(rawPath: string): string {
  if (rawPath.startsWith("/pas/")) return "/pas/[passId]";
  if (rawPath.startsWith("/api/pool/")) return "/api/pool/[gamePoolId]";
  return rawPath;
}

export function initPostHog(config?: ClientTelemetryConfig) {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return;

  const posthogKey = config?.posthogKey;
  if (!posthogKey) {
    return;
  }

  const hostname = window.location.hostname;
  const env = config?.passieEnv || "development";

  // Prevent production key pollution if running on localhost with a production environment tag
  if (
    env === "production" &&
    (hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".local"))
  ) {
    return;
  }

  const rawHost = config?.posthogHost || "https://eu.i.posthog.com";
  const uiHost = rawHost.includes("us.i.posthog.com")
    ? "https://us.posthog.com"
    : "https://eu.posthog.com";

  posthog.init(posthogKey, {
    api_host: "/ingest",
    ui_host: uiHost,
    person_profiles: "identified_only",
    autocapture: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_pageview: "history_change",
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    capture_performance: {
      web_vitals: true,
      network_timing: false,
      web_vitals_allowed_metrics: ["LCP", "INP", "CLS"],
    },
    advanced_disable_flags: true,
    property_denylist: [
      "$referrer",
      "$referring_domain",
      "$initial_referrer",
      "$initial_referring_domain",
    ],
    external_scripts_inject_target: "head",
    secure_cookie: true,
    persistence: "localStorage+cookie",
    before_send: (event) => {
      if (!event) return null;
      if (!ALLOWED_ANALYTICS_EVENTS.has(event.event)) {
        return null;
      }
      if (event.properties) {
        if (event.properties.$current_url) {
          event.properties.$current_url = sanitizeUrl(
            String(event.properties.$current_url)
          );
        }
        if (event.properties.$pathname) {
          event.properties.$pathname = sanitizePathname(
            String(event.properties.$pathname)
          );
        }
        if (event.properties.$exception_message) {
          event.properties.$exception_message = sanitizeExceptionText(
            String(event.properties.$exception_message)
          );
        }
        if (Array.isArray(event.properties.$exception_list)) {
          event.properties.$exception_list = event.properties.$exception_list.map(
            (item: unknown) => {
              if (item && typeof item === "object" && "value" in item) {
                const entry = item as Record<string, unknown>;
                return {
                  ...entry,
                  value:
                    typeof entry.value === "string"
                      ? sanitizeExceptionText(entry.value)
                      : entry.value,
                };
              }
              return item;
            }
          );
        }
        delete event.properties.guestName;
        delete event.properties.displayName;
        delete event.properties.passId;
        delete event.properties.seatInfo;
        delete event.properties.email;
      }
      return event;
    },
    loaded: (ph) => {
      ph.register({
        environment: env,
      });
    },
  });
}

export interface MemberIdentityPayload {
  id: string;
  slug: string;
  displayName: string;
  isPassOwner?: boolean;
  ownedPassCount?: number;
}

export function trackMemberIdentity(
  member: MemberIdentityPayload,
  groupSlug = "goedvolk",
  groupName = "Goed Volk"
) {
  if (typeof window === "undefined" || !posthog.__loaded) return;

  const currentDistinctId = posthog.get_distinct_id();
  const userState = posthog.get_property("$user_state");

  // Only reset when switching away from an already identified different person.
  // Never reset before a first identify (which would break anonymous -> identified merge).
  if (userState === "identified" && currentDistinctId && currentDistinctId !== member.id) {
    posthog.reset();
  }

  const isAlreadyIdentified =
    posthog.get_property("$user_state") === "identified" &&
    posthog.get_distinct_id() === member.id;

  if (!isAlreadyIdentified) {
    posthog.identify(
      member.id,
      {
        member_slug: member.slug,
        display_name: member.displayName,
        group_slug: groupSlug,
        is_pass_owner: Boolean(member.isPassOwner),
        owned_pass_count: member.ownedPassCount ?? 0,
      },
      {
        first_identified_at: new Date().toISOString(),
      }
    );
  }

  const existingGroups = typeof posthog.getGroups === "function" ? posthog.getGroups() : {};
  if (!existingGroups || existingGroups.group !== groupSlug) {
    posthog.group("group", groupSlug, { name: groupName });
  }
}

export function trackMemberSelected(member: MemberIdentityPayload) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("member.selected", {
    is_pass_owner: Boolean(member.isPassOwner),
    owned_pass_count: member.ownedPassCount ?? 0,
  });
}

export function resetAnalytics() {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.reset();
}

export function identifyUser(memberId: string) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  const currentDistinctId = posthog.get_distinct_id();
  const userState = posthog.get_property("$user_state");
  if (userState === "identified" && currentDistinctId && currentDistinctId !== memberId) {
    posthog.reset();
  }
  if (posthog.get_distinct_id() !== memberId) {
    posthog.identify(memberId);
  }
}

export function resetUser() {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.reset();
}

export function getHoursToKickoffBucket(kickoffTimestamp?: number | null): string {
  if (!kickoffTimestamp) return "unknown";
  const nowSec = Math.floor(Date.now() / 1000);
  const diffHours = (kickoffTimestamp - nowSec) / 3600;
  if (diffHours < 0) return "post_kickoff";
  if (diffHours < 6) return "<6h";
  if (diffHours < 24) return "6-24h";
  if (diffHours < 48) return "24-48h";
  if (diffHours < 72) return "48-72h";
  return ">72h";
}

export function trackIndicateKeep(props?: {
  hoursToKickoffBucket?: string;
  passCount?: number;
}) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("pass.indicate_keep", props);
}

export function trackIndicateRelease(props?: {
  hoursToKickoffBucket?: string;
  passCount?: number;
}) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("pass.indicate_release", props);
}

export function trackReclaim(props?: { hoursToKickoffBucket?: string }) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("pass.reclaim", props);
}

export function trackQueueJoinSelf(props?: {
  queueLengthBefore?: number;
  hoursToKickoffBucket?: string;
}) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("queue.join_self", props);
}

export function trackQueueJoinGuest(props?: {
  queueLengthBefore?: number;
  hoursToKickoffBucket?: string;
}) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("queue.join_guest", props);
}

export function trackQueueCancel(props?: {
  queuePosition?: number;
  hoursToKickoffBucket?: string;
}) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("queue.cancel", props);
}

export function trackGiveBack(props?: { hoursToKickoffBucket?: string }) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("pass.give_back", props);
}

export function trackHandover(props?: {
  isHolderNow?: boolean;
  hoursToKickoffBucket?: string;
}) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("pass.handover", props);
}

// Authentication & Passkey Events
export function trackSignInOtpRequested() {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("auth.sign_in_otp_requested");
}

export function trackSignInSuccess(props: { method: "otp" | "passkey" }) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("auth.sign_in_success", props);
}

export function trackSignOut() {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("auth.sign_out");
}

export function trackPasskeyRegistered() {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("auth.passkey_registered");
}

export function trackPasskeyDeleted() {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("auth.passkey_deleted");
}

export function trackSessionsRevoked() {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("auth.sessions_revoked");
}

// Admin Events
export function trackAdminLogin() {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("admin.login");
}

export function trackAdminMemberCreated() {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("admin.member_created");
}

export function trackAdminMemberUpdated(props?: { changed?: string[] }) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("admin.member_updated", props);
}

export function trackAdminMembersReordered(props?: { memberCount?: number }) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("admin.members_reordered", props);
}

export function trackClientException(
  error: unknown,
  additionalProperties?: Record<string, unknown>
) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  if (typeof posthog.captureException === "function") {
    posthog.captureException(error, additionalProperties);
  }
}

export { posthog };
