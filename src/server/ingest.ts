import { and, eq, gte, inArray } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";
import { parseIcsEvents } from "./ics";
import { computeIndicationDeadline } from "../domain/deadlines";
import { mutate } from "./commit";

export interface IngestOptions {
  ifModifiedSince?: string | null;
  eTag?: string | null;
  timeoutMs?: number;
  now?: number; // Unix seconds UTC override for testing
}

export interface IngestResult {
  clubSlug: string;
  totalParsed: number;
  inserted: number;
  updated: number;
  cancelled: number;
  notModified?: boolean;
  eTag?: string | null;
  lastModified?: string | null;
}

// In-memory timestamp tracker for cooldown checks across requests within the worker/server instance
let lastIngestCompletedAt: number | null = null;

export function getLastIngestCompletedAt(): number | null {
  return lastIngestCompletedAt;
}

export function setLastIngestCompletedAt(timestampSec: number | null): void {
  lastIngestCompletedAt = timestampSec;
}

export function getIngestCooldownSeconds(): number {
  const envVal = process.env.PASSIE_INGEST_COOLDOWN_SECONDS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 300; // Default 5 minutes (300 seconds)
}

export function checkIngestCooldown(nowSec: number = Math.floor(Date.now() / 1000)): {
  allowed: boolean;
  cooldownSeconds: number;
  remainingSeconds: number;
  lastIngestAt: number | null;
} {
  const cooldownSeconds = getIngestCooldownSeconds();
  if (lastIngestCompletedAt === null || cooldownSeconds <= 0) {
    return {
      allowed: true,
      cooldownSeconds,
      remainingSeconds: 0,
      lastIngestAt: lastIngestCompletedAt,
    };
  }

  const elapsed = nowSec - lastIngestCompletedAt;
  if (elapsed >= cooldownSeconds) {
    return {
      allowed: true,
      cooldownSeconds,
      remainingSeconds: 0,
      lastIngestAt: lastIngestCompletedAt,
    };
  }

  return {
    allowed: false,
    cooldownSeconds,
    remainingSeconds: cooldownSeconds - elapsed,
    lastIngestAt: lastIngestCompletedAt,
  };
}

export async function ingestClubFixtures(
  db: DbClient,
  clubSlug: string,
  options?: IngestOptions
): Promise<IngestResult> {
  const club = await db.query.clubs.findFirst({
    where: eq(schema.clubs.slug, clubSlug),
  });

  if (!club) {
    throw new Error(`Club ${clubSlug} not found`);
  }

  // Fetch season for club
  const season = await db.query.seasons.findFirst({
    where: eq(schema.seasons.clubId, club.id),
  });

  if (!season) {
    throw new Error(`Season not found for club ${club.id}`);
  }

  const defaultCompetition = club.slug === "excelsior" ? "Eredivisie" : "Competitie";

  console.log(`Fetching ICS feed from ${club.icsHomeFeedUrl}...`);
  const headers: Record<string, string> = {
    Accept: "text/calendar, text/plain, */*",
  };

  if (options?.ifModifiedSince) {
    headers["If-Modified-Since"] = options.ifModifiedSince;
  }
  if (options?.eTag) {
    headers["If-None-Match"] = options.eTag;
  }

  const timeoutMs = options?.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(club.icsHomeFeedUrl, {
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const newETag = response.headers.get("etag");
  const newLastModified = response.headers.get("last-modified");

  if (response.status === 304) {
    return {
      clubSlug,
      totalParsed: 0,
      inserted: 0,
      updated: 0,
      cancelled: 0,
      notModified: true,
      eTag: newETag ?? options?.eTag ?? null,
      lastModified: newLastModified ?? options?.ifModifiedSince ?? null,
    };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ICS feed: HTTP ${response.status}`);
  }

  const rawIcs = await response.text();
  const parsedFixtures = parseIcsEvents(rawIcs, "Europe/Amsterdam");
  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;

  let inserted = 0;
  let updated = 0;
  let cancelled = 0;

  const feedUids = new Set<string>();
  let minFeedKickoff = Number.POSITIVE_INFINITY;
  let maxFeedKickoff = Number.NEGATIVE_INFINITY;

  for (const fix of parsedFixtures) {
    feedUids.add(fix.uid);
    if (fix.kickoffAt < minFeedKickoff) minFeedKickoff = fix.kickoffAt;
    if (fix.kickoffAt > maxFeedKickoff) maxFeedKickoff = fix.kickoffAt;

    // Skip old events
    if (fix.kickoffAt < sevenDaysAgo) {
      continue;
    }

    const fixtureId = `fix_${club.slug}_${fix.uid}`;
    const competition = fix.competition ?? defaultCompetition;

    // Find existing fixture
    const existing = await db.query.fixtures.findFirst({
      where: and(
        eq(schema.fixtures.clubId, club.id),
        eq(schema.fixtures.source, "ics"),
        eq(schema.fixtures.sourceUid, fix.uid)
      ),
    });

    if (!existing) {
      await db.insert(schema.fixtures).values({
        id: fixtureId,
        clubId: club.id,
        seasonId: season.id,
        source: "ics",
        sourceUid: fix.uid,
        sourceSequence: fix.sequence,
        sourceLastModified: fix.lastModified ?? null,
        competition,
        opponent: fix.opponent,
        isHome: 1,
        kickoffAt: fix.kickoffAt,
        venue: fix.venue,
        status: fix.status,
        rawSummary: fix.rawSummary,
        createdAt: now,
        updatedAt: now,
      });
      inserted++;
    } else {
      const kickoffChanged = existing.kickoffAt !== fix.kickoffAt;
      const statusChanged = existing.status !== fix.status;
      const sequenceChanged = existing.sourceSequence !== fix.sequence;
      const lastModifiedChanged =
        fix.lastModified != null &&
        existing.sourceLastModified !== fix.lastModified;
      const opponentChanged = existing.opponent !== fix.opponent;
      const venueChanged = existing.venue !== fix.venue;
      const summaryChanged = existing.rawSummary !== fix.rawSummary;
      const competitionChanged =
        fix.competition != null && existing.competition !== fix.competition;

      const hasChanges =
        kickoffChanged ||
        statusChanged ||
        sequenceChanged ||
        lastModifiedChanged ||
        opponentChanged ||
        venueChanged ||
        summaryChanged ||
        competitionChanged;

      if (hasChanges) {
        await db
          .update(schema.fixtures)
          .set({
            kickoffAt: fix.kickoffAt,
            status: fix.status,
            sourceSequence: fix.sequence,
            sourceLastModified: fix.lastModified ?? existing.sourceLastModified,
            rawSummary: fix.rawSummary,
            opponent: fix.opponent,
            venue: fix.venue,
            competition: fix.competition ?? existing.competition,
            updatedAt: now,
          })
          .where(eq(schema.fixtures.id, existing.id));

        updated++;

        // If kickoff or status changed, update any linked game pools via mutate()
        const pools = await db.query.gamePools.findMany({
          where: eq(schema.gamePools.fixtureId, existing.id),
        });

        for (const p of pools) {
          if (kickoffChanged) {
            const newDeadline = computeIndicationDeadline(fix.kickoffAt);
            await mutate(
              db,
              p.id,
              {
                type: "MarkFixtureRescheduled",
                newKickoffAt: fix.kickoffAt,
                newDeadlineAt: newDeadline,
              },
              null,
              { now }
            );
          }

          if (statusChanged && fix.status === "cancelled") {
            await mutate(
              db,
              p.id,
              {
                type: "MarkFixtureCancelled",
              },
              null,
              { now }
            );
          }
        }
      }
    }
  }

  // Handle disappeared fixtures:
  // Identify upcoming scheduled fixtures for this club from source 'ics'
  // that fall within the feed's window (minFeedKickoff to maxFeedKickoff or >= now - 3h)
  // but are no longer present in feedUids.
  if (parsedFixtures.length > 0 && Number.isFinite(minFeedKickoff)) {
    const activeScheduledFixtures = await db.query.fixtures.findMany({
      where: and(
        eq(schema.fixtures.clubId, club.id),
        eq(schema.fixtures.source, "ics"),
        eq(schema.fixtures.status, "scheduled"),
        gte(schema.fixtures.kickoffAt, Math.max(now - 3 * 3600, minFeedKickoff))
      ),
    });

    const disappeared = activeScheduledFixtures.filter(
      (f) =>
        f.sourceUid &&
        !feedUids.has(f.sourceUid) &&
        f.kickoffAt <= maxFeedKickoff
    );

    for (const f of disappeared) {
      await db
        .update(schema.fixtures)
        .set({
          status: "cancelled",
          updatedAt: now,
        })
        .where(eq(schema.fixtures.id, f.id));

      cancelled++;

      const pools = await db.query.gamePools.findMany({
        where: eq(schema.gamePools.fixtureId, f.id),
      });

      for (const p of pools) {
        if (p.status !== "cancelled") {
          await mutate(
            db,
            p.id,
            {
              type: "MarkFixtureCancelled",
            },
            null,
            { now }
          );
        }
      }
    }
  }

  lastIngestCompletedAt = now;

  return {
    clubSlug,
    totalParsed: parsedFixtures.length,
    inserted,
    updated,
    cancelled,
    eTag: newETag,
    lastModified: newLastModified,
  };
}
