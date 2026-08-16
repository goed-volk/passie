import posthog from "posthog-js";

export function initPostHog() {
  if (typeof window === "undefined") return;

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!posthogKey) {
    return;
  }

  posthog.init(posthogKey, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: true,
  });
}

export { posthog };
