export interface ParsedFixture {
  uid: string;
  kickoffAt: number; // Unix seconds UTC
  venue: string;
  opponent: string;
  rawSummary: string;
  status: "scheduled" | "cancelled";
  sequence: number;
  lastModified?: number | null;
  competition?: string;
  categories?: string[];
}

export function parseZonedDateTime(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
  timeZone: string = "Europe/Amsterdam"
): number {
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const getParts = (timestamp: number) => {
    const parts = dtf.formatToParts(new Date(timestamp));
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== "literal") {
        map[p.type] = parseInt(p.value, 10);
      }
    }
    let h = map.hour ?? 0;
    if (h === 24) h = 0;
    return {
      year: map.year ?? year,
      month: map.month ?? month,
      day: map.day ?? day,
      hour: h,
      minute: map.minute ?? minute,
      second: map.second ?? second,
    };
  };

  const tzParts = getParts(guessUtc);
  const tzAsUtc = Date.UTC(
    tzParts.year,
    tzParts.month - 1,
    tzParts.day,
    tzParts.hour,
    tzParts.minute,
    tzParts.second
  );

  const offsetMs = tzAsUtc - guessUtc;
  const targetUtcMs = guessUtc - offsetMs;

  // Double check against potential DST transition
  const checkParts = getParts(targetUtcMs);
  const checkAsUtc = Date.UTC(
    checkParts.year,
    checkParts.month - 1,
    checkParts.day,
    checkParts.hour,
    checkParts.minute,
    checkParts.second
  );
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const diffMs = checkAsUtc - desiredUtc;

  return Math.floor((targetUtcMs - diffMs) / 1000);
}

export function parseIcsDate(
  icsDateStr: string,
  tzId?: string | null,
  defaultTimeZone: string = "Europe/Amsterdam"
): number {
  if (!icsDateStr || typeof icsDateStr !== "string") {
    return 0;
  }

  let rawValue = icsDateStr.trim();
  let extractedTz = tzId ?? null;

  // Handle parameter syntax if whole property string was passed, e.g.:
  // "DTSTART;TZID=Europe/Amsterdam:20260913T141500" or "TZID=Europe/Amsterdam:20260913T141500"
  if (rawValue.includes(":")) {
    const colonIdx = rawValue.lastIndexOf(":");
    const prefix = rawValue.slice(0, colonIdx);
    rawValue = rawValue.slice(colonIdx + 1).trim();

    const tzidMatch = prefix.match(/TZID=(?:\"([^\"]+)\"|([^;:]+))/i);
    if (tzidMatch) {
      extractedTz = tzidMatch[1] ?? tzidMatch[2] ?? null;
    }
  }

  const isUtc = rawValue.endsWith("Z") || rawValue.endsWith("z");
  const clean = rawValue.replace(/[^0-9T]/g, "");

  if (clean.length < 8) {
    return 0;
  }

  const year = parseInt(clean.slice(0, 4), 10);
  const month = parseInt(clean.slice(4, 6), 10);
  const day = parseInt(clean.slice(6, 8), 10);

  if (
    isNaN(year) ||
    isNaN(month) ||
    isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return 0;
  }

  let hour = 0;
  let minute = 0;
  let second = 0;

  if (clean.includes("T")) {
    const tIndex = clean.indexOf("T");
    const timePart = clean.slice(tIndex + 1);
    hour = parseInt(timePart.slice(0, 2), 10) || 0;
    minute = parseInt(timePart.slice(2, 4), 10) || 0;
    second = parseInt(timePart.slice(4, 6), 10) || 0;
  }

  if (isUtc) {
    return Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 1000);
  }

  const effectiveTz = extractedTz || defaultTimeZone;
  return parseZonedDateTime(year, month, day, hour, minute, second, effectiveTz);
}

export function unfoldIcsLines(rawIcs: string): string[] {
  // Unfold lines: CRLF or LF followed by space or tab continues previous line
  const normalized = rawIcs.replace(/\r\n/g, "\n");
  const unfolded = normalized.replace(/\n[ \t]/g, "");
  return unfolded.split("\n");
}

export function unescapeIcsValue(val: string): string {
  return val
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

export function extractCompetition(
  summary: string,
  categories?: string[]
): string | undefined {
  if (categories && categories.length > 0) {
    const known = [
      "eredivisie",
      "knvb beker",
      "keuken kampioen divisie",
      "champions league",
      "europa league",
      "conference league",
      "vriendschappelijk",
      "play-offs",
    ];
    for (const cat of categories) {
      const trimmed = cat.trim();
      if (known.includes(trimmed.toLowerCase())) {
        return trimmed;
      }
    }
    for (const cat of categories) {
      const lower = cat.toLowerCase().trim();
      if (
        lower !== "voetbal" &&
        lower !== "football" &&
        lower !== "sport" &&
        lower !== "match" &&
        lower !== "wedstrijd"
      ) {
        return cat.trim();
      }
    }
  }

  const bracketMatch = summary.match(/^\[(.*?)\]/);
  if (bracketMatch?.[1]) {
    return bracketMatch[1].trim();
  }

  const prefixMatch = summary.match(
    /^(Eredivisie|KNVB Beker|Keuken Kampioen Divisie|Vriendschappelijk)\s*[:-]\s*/i
  );
  if (prefixMatch?.[1]) {
    return prefixMatch[1].trim();
  }

  return undefined;
}

export function extractOpponent(summary: string): string {
  let cleanSummary = summary.replace(/^\[.*?\]\s*/, "");
  cleanSummary = cleanSummary.replace(
    /^(Eredivisie|KNVB Beker|Keuken Kampioen Divisie|Vriendschappelijk)\s*[:-]\s*/i,
    ""
  );

  // Excelsior - Opponent (Score) or Excelsior - Opponent
  let opponent = cleanSummary;
  const dashIndex = cleanSummary.indexOf(" - ");
  if (dashIndex !== -1) {
    opponent = cleanSummary.slice(dashIndex + 3);
  }

  // Strip trailing (score) like (2-2) or (1-0)
  opponent = opponent.replace(/\s*\(\d+-\d+\)\s*$/, "").trim();
  return opponent;
}

export function parseIcsEvents(
  rawIcs: string,
  defaultTimeZone: string = "Europe/Amsterdam"
): ParsedFixture[] {
  const lines = unfoldIcsLines(rawIcs);
  const fixtures: ParsedFixture[] = [];

  let inEvent = false;
  let currentUid = "";
  let currentStart = 0;
  let currentSummary = "";
  let currentVenue = "";
  let currentStatus: "scheduled" | "cancelled" = "scheduled";
  let currentSequence = 0;
  let currentLastModified: number | null = null;
  let currentCategories: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      currentUid = "";
      currentStart = 0;
      currentSummary = "";
      currentVenue = "";
      currentStatus = "scheduled";
      currentSequence = 0;
      currentLastModified = null;
      currentCategories = [];
      continue;
    }

    if (trimmed === "END:VEVENT") {
      if (inEvent && currentUid && currentStart > 0) {
        const competition = extractCompetition(
          currentSummary,
          currentCategories
        );
        fixtures.push({
          uid: currentUid,
          kickoffAt: currentStart,
          rawSummary: currentSummary,
          opponent: extractOpponent(currentSummary),
          venue: currentVenue,
          status: currentStatus,
          sequence: currentSequence,
          lastModified: currentLastModified,
          ...(competition ? { competition } : {}),
          ...(currentCategories.length > 0
            ? { categories: currentCategories }
            : {}),
        });
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const nameAndParams = trimmed.slice(0, colonIndex);
    const val = trimmed.slice(colonIndex + 1);

    const paramParts = nameAndParams.split(";");
    const key = paramParts[0]!.toUpperCase().trim();

    if (key === "UID") {
      currentUid = val.trim();
    } else if (key === "DTSTART") {
      let tzid: string | null = null;
      for (const param of paramParts.slice(1)) {
        const match = param.match(/^TZID=(?:\"([^\"]+)\"|([^;:]+))/i);
        if (match) {
          tzid = match[1] ?? match[2] ?? null;
        }
      }
      currentStart = parseIcsDate(val, tzid, defaultTimeZone);
    } else if (key === "SUMMARY") {
      currentSummary = unescapeIcsValue(val);
    } else if (key === "LOCATION") {
      currentVenue = unescapeIcsValue(val);
    } else if (key === "STATUS") {
      if (val.toUpperCase().trim() === "CANCELLED") {
        currentStatus = "cancelled";
      }
    } else if (key === "SEQUENCE") {
      currentSequence = parseInt(val.trim(), 10) || 0;
    } else if (key === "LAST-MODIFIED") {
      currentLastModified = parseIcsDate(val, null, defaultTimeZone);
    } else if (key === "CATEGORIES") {
      currentCategories = val
        .split(",")
        .map((c) => unescapeIcsValue(c.trim()))
        .filter(Boolean);
    }
  }

  return fixtures;
}
