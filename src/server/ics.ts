export interface ParsedFixture {
  uid: string;
  kickoffAt: number; // Unix seconds UTC
  venue: string;
  opponent: string;
  rawSummary: string;
  status: "scheduled" | "cancelled";
  sequence: number;
  lastModified?: number | null;
}

export function parseIcsDate(icsDateStr: string): number {
  // Format: 20260913T101500Z or 20260913T101500
  const clean = icsDateStr.replace(/[^0-9T]/g, "");
  const year = parseInt(clean.slice(0, 4), 10);
  const month = parseInt(clean.slice(4, 6), 10) - 1;
  const day = parseInt(clean.slice(6, 8), 10);
  const hour = parseInt(clean.slice(9, 11), 10) || 0;
  const minute = parseInt(clean.slice(11, 13), 10) || 0;
  const second = parseInt(clean.slice(13, 15), 10) || 0;

  return Math.floor(Date.UTC(year, month, day, hour, minute, second) / 1000);
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

export function extractOpponent(summary: string): string {
  // Excelsior - Opponent (Score) or Excelsior - Opponent
  let opponent = summary;
  const dashIndex = summary.indexOf(" - ");
  if (dashIndex !== -1) {
    opponent = summary.slice(dashIndex + 3);
  }

  // Strip trailing (score) like (2-2) or (1-0)
  opponent = opponent.replace(/\s*\(\d+-\d+\)\s*$/, "").trim();
  return opponent;
}

export function parseIcsEvents(rawIcs: string): ParsedFixture[] {
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
      continue;
    }

    if (trimmed === "END:VEVENT") {
      if (inEvent && currentUid && currentStart > 0) {
        fixtures.push({
          uid: currentUid,
          kickoffAt: currentStart,
          rawSummary: currentSummary,
          opponent: extractOpponent(currentSummary),
          venue: currentVenue,
          status: currentStatus,
          sequence: currentSequence,
          lastModified: currentLastModified,
        });
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).toUpperCase();
    const val = trimmed.slice(colonIndex + 1);

    if (key === "UID") {
      currentUid = val;
    } else if (key.startsWith("DTSTART")) {
      currentStart = parseIcsDate(val);
    } else if (key === "SUMMARY") {
      currentSummary = unescapeIcsValue(val);
    } else if (key === "LOCATION") {
      currentVenue = unescapeIcsValue(val);
    } else if (key === "STATUS") {
      if (val.toUpperCase() === "CANCELLED") {
        currentStatus = "cancelled";
      }
    } else if (key === "SEQUENCE") {
      currentSequence = parseInt(val, 10) || 0;
    } else if (key === "LAST-MODIFIED") {
      currentLastModified = parseIcsDate(val);
    }
  }

  return fixtures;
}
