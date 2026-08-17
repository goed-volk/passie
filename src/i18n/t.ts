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
  const pass = (passId && passLabels.get(passId)) || "Pas";

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
      return `${pass} toegewezen aan ${target}`;
    }
    case "pass.unassigned":
      return `${actor} geeft ${pass} terug`;
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
      return `${pass} overgedragen van ${from} naar ${to}`;
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
