import { and, eq } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";
import { parseIcsEvents } from "./ics";
import { computeIndicationDeadline } from "../domain/deadlines";
import { mutate } from "./commit";

export interface IngestResult {
  clubSlug: string;
  totalParsed: number;
  inserted: number;
  updated: number;
}

export async function ingestClubFixtures(
  db: DbClient,
  clubSlug: string
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

  console.log(`Fetching ICS feed from ${club.icsHomeFeedUrl}...`);
  const response = await fetch(club.icsHomeFeedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ICS feed: HTTP ${response.status}`);
  }

  const rawIcs = await response.text();
  const parsedFixtures = parseIcsEvents(rawIcs);
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;

  let inserted = 0;
  let updated = 0;

  for (const fix of parsedFixtures) {
    // Skip old events
    if (fix.kickoffAt < sevenDaysAgo) {
      continue;
    }

    const fixtureId = `fix_${club.slug}_${fix.uid}`;

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
        competition: "Eredivisie",
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

      if (kickoffChanged || statusChanged || sequenceChanged) {
        await db
          .update(schema.fixtures)
          .set({
            kickoffAt: fix.kickoffAt,
            status: fix.status,
            sourceSequence: fix.sequence,
            sourceLastModified: fix.lastModified ?? null,
            rawSummary: fix.rawSummary,
            opponent: fix.opponent,
            venue: fix.venue,
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
              null
            );
          }

          if (statusChanged && fix.status === "cancelled") {
            await mutate(
              db,
              p.id,
              {
                type: "MarkFixtureCancelled",
              },
              null
            );
          }
        }
      }
    }
  }

  return {
    clubSlug,
    totalParsed: parsedFixtures.length,
    inserted,
    updated,
  };
}
