import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import { getActingMember } from "@/server/actingMember";
import { assertSameOrigin } from "@/server/http/assertSameOrigin";
import * as schema from "@/server/schema";
import * as authSchema from "@/server/authSchema";
import {
  dispatchTransactionalEmail,
  formatDutchDeadline,
  formatDutchKickoff,
  renderDeadlineReminderEmail,
  resolvePublicOrigin,
} from "@/server/email";

export const dynamic = "force-dynamic";

export async function handleRemindPost(
  request: Request,
  gamePoolId: string,
  customDb?: import("@/server/db").DbClient
) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const db = customDb ?? (await getDb());
  const actor = await getActingMember(db);

  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  if (actor.role !== "admin") {
    return NextResponse.json(
      { error: "Administrator rights required", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const pool = await db.query.gamePools.findFirst({
    where: eq(schema.gamePools.id, gamePoolId),
  });

  if (!pool) {
    return NextResponse.json(
      { error: "Game pool not found", code: "POOL_NOT_FOUND" },
      { status: 404 }
    );
  }

  if (pool.status !== "open") {
    return NextResponse.json(
      { error: "Game pool is not open", code: "POOL_NOT_OPEN" },
      { status: 422 }
    );
  }

  const fixture = await db.query.fixtures.findFirst({
    where: eq(schema.fixtures.id, pool.fixtureId),
  });

  if (!fixture) {
    return NextResponse.json(
      { error: "Fixture not found", code: "FIXTURE_NOT_FOUND" },
      { status: 404 }
    );
  }

  const club = await db.query.clubs.findFirst({
    where: eq(schema.clubs.id, fixture.clubId),
  });
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, pool.groupId),
  });

  const clubShortName = club?.shortName || "Excelsior";
  const matchLabel = `${clubShortName} - ${fixture.opponent}`;
  const kickoffFormatted = formatDutchKickoff(fixture.kickoffAt);
  const deadlineFormatted = formatDutchDeadline(pool.indicationDeadlineAt);
  const groupName = group?.name || clubShortName;
  const baseUrl = resolvePublicOrigin();

  // 1. Find unindicated pass game states
  const unindicatedStates = await db.query.passGameStates.findMany({
    where: and(
      eq(schema.passGameStates.gamePoolId, gamePoolId),
      eq(schema.passGameStates.status, "unindicated")
    ),
  });

  if (unindicatedStates.length === 0) {
    return NextResponse.json({ ok: true, sentCount: 0, skippedCount: 0 });
  }

  const passIds = unindicatedStates.map((s) => s.passId);
  const passes = await db.query.passes.findMany({
    where: inArray(schema.passes.id, passIds),
  });
  const passMap = new Map(passes.map((p) => [p.id, p]));

  // 2. Find owners for these unindicated passes
  const ownerships = await db.query.passOwners.findMany({
    where: inArray(schema.passOwners.passId, passIds),
  });

  const ownerMemberIds = Array.from(new Set(ownerships.map((o) => o.memberId)));
  const members =
    ownerMemberIds.length > 0
      ? await db.query.members.findMany({
          where: and(
            inArray(schema.members.id, ownerMemberIds),
            eq(schema.members.isActive, 1)
          ),
        })
      : [];
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const userIds = members
    .map((m) => m.userId)
    .filter((id): id is string => Boolean(id));

  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await db.query.auth_user.findMany({
      where: inArray(authSchema.auth_user.id, userIds),
    });
    for (const u of users) {
      if (u.email && u.email.trim() !== "") {
        userMap.set(u.id, u.email.trim().toLowerCase());
      }
    }
  }

  // 3. Deduplicate recipients by owner member.id, accumulating their unindicated pass labels
  interface RecipientData {
    member: typeof members[0];
    passLabels: Set<string>;
    email: string | null;
  }

  const recipients = new Map<string, RecipientData>();

  for (const ownership of ownerships) {
    const member = memberMap.get(ownership.memberId);
    if (!member) continue;

    const pass = passMap.get(ownership.passId);
    if (!pass) continue;

    let rec = recipients.get(member.id);
    if (!rec) {
      const email = member.userId ? userMap.get(member.userId) ?? null : null;
      rec = {
        member,
        passLabels: new Set(),
        email,
      };
      recipients.set(member.id, rec);
    }
    rec.passLabels.add(pass.label);
  }

  let sentCount = 0;
  let skippedCount = 0;
  const recipientMemberIds: string[] = [];

  for (const rec of recipients.values()) {
    if (!rec.email) {
      skippedCount++;
      continue;
    }

    const payload = renderDeadlineReminderEmail({
      to: rec.email,
      ownerName: rec.member.displayName,
      passLabels: Array.from(rec.passLabels),
      matchLabel,
      kickoffFormatted,
      deadlineFormatted,
      groupName,
      baseUrl,
      colorPrimary: club?.colorPrimary,
      colorOnPrimary: club?.colorOnPrimary,
    });

    await dispatchTransactionalEmail({
      payload,
      kind: "deadline_reminder",
      trigger: "admin_manual",
      memberId: rec.member.id,
      db,
    });

    sentCount++;
    recipientMemberIds.push(rec.member.id);
  }

  // 4. Record audit entry in activity_events
  const now = Math.floor(Date.now() / 1000);
  const auditEventId = `evt_deadline_reminded_${gamePoolId}_${now}_${Math.random().toString(36).slice(2, 7)}`;

  await db.insert(schema.activityEvents).values({
    id: auditEventId,
    gamePoolId,
    passId: null,
    actorMemberId: actor.id,
    type: "deadline.reminded",
    payloadJson: JSON.stringify({
      actor: actor.displayName,
      sentCount,
      skippedCount,
      recipientMemberIds,
    }),
    idempotencyKey: null,
    createdAt: now,
  });

  return NextResponse.json({ ok: true, sentCount, skippedCount });
}

export async function POST(
  request: Request,
  props: { params: Promise<{ gamePoolId: string }> }
) {
  const { gamePoolId } = await props.params;
  return handleRemindPost(request, gamePoolId);
}
