import { desc, eq, inArray } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";
import { formatEventText } from "../i18n/t";
import type { MemberId } from "../domain/types";

export interface MemberRef {
  id: string;
  displayName: string;
  initials: string;
  avatarColor: string;
  slug: string;
}

export interface PoolSnapshot {
  id: string;
  version: number;
  status: "open" | "closed" | "cancelled";
  fixture: {
    id: string;
    opponent: string;
    competition: string;
    kickoffAt: number;
    venue: string;
    status: "scheduled" | "cancelled";
  };
  club: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    colorPrimary: string;
    colorSecondary: string;
    colorAccent: string;
    colorOnPrimary: string;
  };
  deadline: {
    at: number;
    passed: boolean;
  };
  actingMember: MemberRef | null;
  members: MemberRef[];
  passes: Array<{
    id: string;
    label: string;
    seatInfo: string | null;
    sortOrder: number;
    owners: MemberRef[];
    holder: MemberRef | null;
    status: "unindicated" | "kept" | "released" | "assigned";
    indicatedBy: MemberRef | null;
    claimant: {
      entryId: number;
      member: MemberRef;
      kind: "self" | "guest";
      guestName: string | null;
    } | null;
    expectedHolder: MemberRef | null;
    canIndicate: boolean;
    canGiveBack: boolean;
  }>;
  queue: Array<{
    entryId: number;
    position: number;
    member: MemberRef;
    kind: "self" | "guest";
    guestName: string | null;
    status: "waiting" | "assigned" | "cancelled";
    assignedPassLabel?: string | null;
    isMine: boolean;
    canCancel: boolean;
  }>;
  transfers: Array<{
    passId: string;
    passLabel: string;
    from: MemberRef | null;
    to: MemberRef;
    involvesMe: boolean;
  }>;
  timeline: Array<{
    id: string;
    type: string;
    at: number;
    text: string;
    actor: MemberRef | null;
  }>;
  counts: {
    unindicated: number;
    kept: number;
    released: number;
    assigned: number;
    waiting: number;
  };
}

export async function buildPoolSnapshot(
  db: DbClient,
  gamePoolId: string,
  actingMemberId: MemberId | null
): Promise<PoolSnapshot | null> {
  const pool = await db.query.gamePools.findFirst({
    where: eq(schema.gamePools.id, gamePoolId),
  });

  if (!pool) {
    return null;
  }

  // 1. Fetch group & club
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, pool.groupId),
  });

  const club = group
    ? await db.query.clubs.findFirst({
        where: eq(schema.clubs.id, group.clubId),
      })
    : null;

  // 2. Fetch fixture
  const fixture = await db.query.fixtures.findFirst({
    where: eq(schema.fixtures.id, pool.fixtureId),
  });

  if (!fixture) {
    return null;
  }

  // 3. Fetch all members in this group
  const membersList = await db.query.members.findMany({
    where: eq(schema.members.groupId, pool.groupId),
  });
  const membersMap = new Map<string, MemberRef>();
  const memberNamesMap = new Map<string, string>();
  for (const m of membersList) {
    const ref: MemberRef = {
      id: m.id,
      displayName: m.displayName,
      initials: m.initials,
      avatarColor: m.avatarColor,
      slug: m.slug,
    };
    membersMap.set(m.id, ref);
    memberNamesMap.set(m.id, m.displayName);
  }

  const actingMember = actingMemberId ? membersMap.get(actingMemberId) ?? null : null;

  // 4. Fetch passes & pass owners
  const passesList = await db.query.passes.findMany({
    where: eq(schema.passes.groupId, pool.groupId),
    orderBy: (p, { asc: orderAsc }) => [orderAsc(p.sortOrder)],
  });

  const passIds = passesList.map((p) => p.id);
  const passOwnersList =
    passIds.length > 0
      ? await db.query.passOwners.findMany({
          where: inArray(schema.passOwners.passId, passIds),
        })
      : [];

  const passOwnersMap = new Map<string, MemberRef[]>();
  for (const o of passOwnersList) {
    const member = membersMap.get(o.memberId);
    if (member) {
      const list = passOwnersMap.get(o.passId) ?? [];
      list.push(member);
      passOwnersMap.set(o.passId, list);
    }
  }

  const passLabelsMap = new Map<string, string>();
  for (const p of passesList) {
    passLabelsMap.set(p.id, p.label);
  }

  // 5. Fetch pass game states
  const passStatesList = await db.query.passGameStates.findMany({
    where: eq(schema.passGameStates.gamePoolId, gamePoolId),
  });
  const passStatesMap = new Map<string, typeof passStatesList[number]>();
  for (const s of passStatesList) {
    passStatesMap.set(s.passId, s);
  }

  // 6. Fetch queue entries
  const queueList = await db.query.queueEntries.findMany({
    where: eq(schema.queueEntries.gamePoolId, gamePoolId),
    orderBy: (q, { asc: orderAsc }) => [orderAsc(q.id)],
  });

  const queueMap = new Map<number, typeof queueList[number]>();
  for (const q of queueList) {
    queueMap.set(q.id, q);
  }

  // 7. Calculate deadline
  const now = Math.floor(Date.now() / 1000);
  const deadline = {
    at: pool.indicationDeadlineAt,
    passed: now >= pool.indicationDeadlineAt,
  };

  // 8. Build pass views
  const counts = {
    unindicated: 0,
    kept: 0,
    released: 0,
    assigned: 0,
    waiting: 0,
  };

  const passesView = passesList.map((p) => {
    const s = passStatesMap.get(p.id);
    const status = (s?.status ?? "unindicated") as "unindicated" | "kept" | "released" | "assigned";
    counts[status]++;

    const owners = passOwnersMap.get(p.id) ?? [];
    const holder = p.holderMemberId ? membersMap.get(p.holderMemberId) ?? null : null;
    const indicatedBy = s?.indicatedByMemberId ? membersMap.get(s.indicatedByMemberId) ?? null : null;

    let claimant: PoolSnapshot["passes"][number]["claimant"] = null;
    if (status === "assigned" && s?.claimantEntryId) {
      const q = queueMap.get(s.claimantEntryId);
      if (q) {
        const claimantMember = membersMap.get(q.memberId);
        if (claimantMember) {
          claimant = {
            entryId: q.id,
            member: claimantMember,
            kind: q.kind as "self" | "guest",
            guestName: q.guestName,
          };
        }
      }
    }

    // Expected holder: claimant if assigned, else indicated owner if kept, else current holder
    let expectedHolder: MemberRef | null = holder;
    if (status === "assigned" && claimant) {
      expectedHolder = claimant.member;
    } else if (status === "kept" && indicatedBy) {
      expectedHolder = indicatedBy;
    }

    const isOwner = actingMemberId ? owners.some((o) => o.id === actingMemberId) : false;
    const isClaimant = actingMemberId && claimant ? claimant.member.id === actingMemberId : false;

    return {
      id: p.id,
      label: p.label,
      seatInfo: p.seatInfo,
      sortOrder: p.sortOrder,
      owners,
      holder,
      status,
      indicatedBy,
      claimant,
      expectedHolder,
      canIndicate: isOwner && status !== "assigned",
      canGiveBack: Boolean(isClaimant && status === "assigned"),
    };
  });

  // 9. Build queue view
  let waitingPosition = 1;
  const queueView = queueList.map((q) => {
    if (q.status === "waiting") {
      counts.waiting++;
    }
    const member = membersMap.get(q.memberId)!;
    const isMine = actingMemberId === q.memberId;
    const pos = q.status === "waiting" ? waitingPosition++ : 0;
    const assignedPassLabel = q.assignedPassId ? passLabelsMap.get(q.assignedPassId) ?? null : null;

    return {
      entryId: q.id,
      position: pos,
      member,
      kind: q.kind as "self" | "guest",
      guestName: q.guestName,
      status: q.status as "waiting" | "assigned" | "cancelled",
      assignedPassLabel,
      isMine,
      canCancel: isMine && q.status === "waiting",
    };
  });

  // 10. Build transfer task list
  const transfers: PoolSnapshot["transfers"] = [];
  for (const p of passesView) {
    if (p.expectedHolder && (!p.holder || p.holder.id !== p.expectedHolder.id)) {
      const involvesMe =
        Boolean(actingMemberId && (p.holder?.id === actingMemberId || p.expectedHolder.id === actingMemberId));
      transfers.push({
        passId: p.id,
        passLabel: p.label,
        from: p.holder,
        to: p.expectedHolder,
        involvesMe,
      });
    }
  }

  // Sort transfers so tasks involving the acting member appear first
  transfers.sort((a, b) => (b.involvesMe ? 1 : 0) - (a.involvesMe ? 1 : 0));

  // 11. Fetch recent activity events (up to 50)
  const eventsList = await db.query.activityEvents.findMany({
    where: eq(schema.activityEvents.gamePoolId, gamePoolId),
    orderBy: [desc(schema.activityEvents.createdAt)],
    limit: 50,
  });

  const timeline = eventsList.map((evt) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(evt.payloadJson);
    } catch {
      payload = {};
    }
    const actorRef = evt.actorMemberId ? membersMap.get(evt.actorMemberId) ?? null : null;
    const text = formatEventText(
      evt.type,
      payload,
      memberNamesMap,
      passLabelsMap,
      actorRef?.displayName,
      group?.timezone ?? "Europe/Amsterdam"
    );
    return {
      id: evt.id,
      type: evt.type,
      at: evt.createdAt,
      text,
      actor: actorRef,
    };
  });

  return {
    id: pool.id,
    version: pool.version,
    status: pool.status as "open" | "closed" | "cancelled",
    fixture: {
      id: fixture.id,
      opponent: fixture.opponent,
      competition: fixture.competition,
      kickoffAt: fixture.kickoffAt,
      venue: fixture.venue,
      status: fixture.status as "scheduled" | "cancelled",
    },
    club: {
      id: club?.id ?? "club_excelsior",
      slug: club?.slug ?? "excelsior",
      name: club?.name ?? "Excelsior Rotterdam",
      shortName: club?.shortName ?? "Excelsior",
      colorPrimary: club?.colorPrimary ?? "#E30613",
      colorSecondary: club?.colorSecondary ?? "#000000",
      colorAccent: club?.colorAccent ?? "#FFFFFF",
      colorOnPrimary: club?.colorOnPrimary ?? "#FFFFFF",
    },
    deadline,
    actingMember,
    members: Array.from(membersMap.values()),
    passes: passesView,
    queue: queueView,
    transfers,
    timeline,
    counts,
  };
}
