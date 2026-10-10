import { nl } from "./nl";

export function t(key: keyof typeof nl, params?: Record<string, string | number>): string {
  const value = nl[key];
  if (typeof value !== "string") {
    return String(key);
  }
  if (!params) {
    return value;
  }
  let result: string = value;
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(new RegExp(`{${k}}`, "g"), String(v));
  }
  return result;
}

export function formatKickoffDateTime(
  timestampSec: number,
  timeZone: string = "Europe/Amsterdam",
  locale: string = "nl-NL"
): string {
  const date = new Date(timestampSec * 1000);
  const dtf = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return dtf.format(date);
}

export function formatDeadlineDateTime(
  timestampSec: number,
  timeZone: string = "Europe/Amsterdam",
  locale: string = "nl-NL"
): string {
  const date = new Date(timestampSec * 1000);
  const weekday = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat(locale, { timeZone, day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat(locale, { timeZone, month: "long" }).format(date);
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
  return `${weekday} ${day} ${month} om ${time} uur`;
}

export function formatTimelineTimestamp(
  timestampSec: number,
  referenceDate: Date = new Date(),
  timeZone: string = "Europe/Amsterdam",
  locale: string = "nl-NL"
): string {
  const eventDate = new Date(timestampSec * 1000);

  // Compare calendar days in the specified timezone
  const dtfDay = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const eventDayKey = dtfDay.format(eventDate);
  const refDayKey = dtfDay.format(referenceDate);

  const timeStr = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(eventDate);

  // Same calendar day -> time only (e.g. "11:25")
  if (eventDayKey === refDayKey) {
    return timeStr;
  }

  // Elapsed difference in days
  const diffDays = Math.floor((referenceDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));

  // Within past 7 days -> weekday + time (e.g. "wo 11:25")
  if (diffDays >= 0 && diffDays < 7) {
    const weekday = new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: "short",
    }).format(eventDate);
    return `${weekday} ${timeStr}`;
  }

  // Older than 7 days -> date + time (e.g. "12 sep 11:25")
  const dayMonth = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
  }).format(eventDate);
  return `${dayMonth} ${timeStr}`;
}

export function formatPassLabel(label: string, options?: { capitalize?: boolean }): string {
  const trimmed = label.trim();
  const lower = trimmed.toLowerCase();

  let formatted: string;
  if (lower.startsWith("pas van ") || lower.startsWith("pas ")) {
    formatted = trimmed;
  } else {
    formatted = `pas van ${trimmed}`;
  }

  if (options?.capitalize) {
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
  return formatted;
}

export function formatEventText(
  type: string,
  payload: Record<string, unknown>,
  memberNames: Map<string, string>,
  passLabels: Map<string, string>,
  actorName?: string,
  timeZone: string = "Europe/Amsterdam"
): string {
  const actor = actorName ?? "Iemand";
  const passId = payload.passId as string | undefined;
  const rawPass = (passId && passLabels.get(passId)) || "Pas";
  const pass = formatPassLabel(rawPass);
  const passCap = formatPassLabel(rawPass, { capitalize: true });

  switch (type) {
    case "pool.opened":
      return nl.events.poolOpened;
    case "pass.kept":
      return `${actor} gebruikt ${pass}`;
    case "pass.released":
      return `${actor} geeft ${pass} vrij`;
    case "pass.assigned": {
      const claimantName =
        (payload.memberId && memberNames.get(payload.memberId as string)) ?? "iemand";
      const forGuest = payload.kind === "guest";
      const target = forGuest
        ? `${claimantName}'s gast${payload.guestName ? ` (${payload.guestName})` : ""}`
        : claimantName;
      return `${passCap} toegewezen aan ${target}`;
    }
    case "pass.unassigned":
      return `${actor} geeft ${pass} terug`;
    case "pass.reclaimed": {
      const fromMemberId = payload.reclaimedFromMemberId as string | undefined;
      const claimantName =
        (fromMemberId && memberNames.get(fromMemberId)) ?? "iemand";
      const forGuest = payload.reclaimedFromKind === "guest";
      const target = forGuest
        ? `${claimantName}'s gast${payload.reclaimedFromGuestName ? ` (${payload.reclaimedFromGuestName})` : ""}`
        : claimantName;
      return `${actor} claimt ${pass} terug van ${target}`;
    }
    case "queue.joined": {
      const forGuest = payload.kind === "guest";
      const kind = forGuest
        ? `gast: ${payload.guestName ?? "onbekend"}`
        : "voor zichzelf";
      return `${actor} sluit aan in de wachtrij (${kind})`;
    }
    case "queue.cancelled":
      return `${actor} stapt uit de wachtrij`;
    case "possession.handover": {
      const from = (payload.fromMemberId && memberNames.get(payload.fromMemberId as string)) ?? "onbekend";
      const to = (payload.toMemberId && memberNames.get(payload.toMemberId as string)) ?? "onbekend";
      return `${passCap} gewisseld van ${from} naar ${to}`;
    }
    case "possession.corrected": {
      const to = (payload.toMemberId && memberNames.get(payload.toMemberId as string)) ?? "onbekend";
      return `Locatie van ${pass} gecorrigeerd: nu bij ${to}`;
    }
    case "fixture.rescheduled": {
      const newKickoff = payload.newKickoffAt;
      const formattedKickoff =
        typeof newKickoff === "number"
          ? formatKickoffDateTime(newKickoff, timeZone)
          : String(newKickoff ?? "");
      return nl.events.fixtureRescheduled.replace("{kickoff}", formattedKickoff);
    }
    case "fixture.cancelled":
      return nl.events.fixtureCancelled;
    default:
      return type;
  }
}
