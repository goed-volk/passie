import posthog from "posthog-js";

export const ALLOWED_ANALYTICS_EVENTS = new Set([
  "pass.indicate_keep",
  "pass.indicate_release",
  "pass.reclaim",
  "queue.join_self",
  "queue.join_guest",
  "queue.cancel",
  "pass.give_back",
  "pass.handover",
  "$identify",
  "$set",
  "$groupidentify",
  "$web_vitals",
  "$performance_event",
]);

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

function sanitizePathname(rawPath: string): string {
  if (rawPath.startsWith("/pas/")) return "/pas/[passId]";
  if (rawPath.startsWith("/api/pool/")) return "/api/pool/[gamePoolId]";
  return rawPath;
}

export function initPostHog() {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return;

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!posthogKey) {
    return;
  }

  const hostname = window.location.hostname;
  const env =
    process.env.NEXT_PUBLIC_PASSIE_ENV ||
    (process.env.NODE_ENV === "production" ? "production" : "development");

  // Prevent production key pollution if running on localhost with a production environment tag
  if (
    env === "production" &&
    (hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".local"))
  ) {
    return;
  }

  posthog.init(posthogKey, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    person_profiles: "identified_only",
    autocapture: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    capture_exceptions: false,
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
        delete event.properties.guestName;
        delete event.properties.displayName;
        delete event.properties.passId;
        delete event.properties.seatInfo;
      }
      return event;
    },
    loaded: (ph) => {
      const env =
        process.env.NEXT_PUBLIC_PASSIE_ENV ||
        (process.env.NODE_ENV === "production" ? "production" : "development");
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
  if (currentDistinctId && currentDistinctId !== member.id) {
    posthog.reset();
  }

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

  posthog.group("group", groupSlug, { name: groupName });
}

export function resetAnalytics() {
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

export { posthog };
