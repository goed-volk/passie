import { eq, asc, inArray } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";
import type {
  GamePoolState,
  PassState,
  QueueEntryState,
  ActivityEvent,
  PassGameStatus,
  QueueEntryStatus,
  QueueEntryKind,
  GamePoolStatus,
} from "../domain/types";

export interface LoadedPoolSnapshot {
  state: GamePoolState;
  version: number;
}

export async function loadGamePoolState(
  db: DbClient,
  gamePoolId: string
): Promise<LoadedPoolSnapshot | null> {
  // 1. Query game pool
  const pool = await db.query.gamePools.findFirst({
    where: eq(schema.gamePools.id, gamePoolId),
  });

  if (!pool) {
    return null;
  }

  // 2. Query all active passes for this group
  const passesList = await db.query.passes.findMany({
    where: eq(schema.passes.groupId, pool.groupId),
    orderBy: [asc(schema.passes.sortOrder)],
  });

  const passIds = passesList.map((p) => p.id);

  // 3. Query pass owners for all passes
  const ownersList =
    passIds.length > 0
      ? await db.query.passOwners.findMany({
          where: inArray(schema.passOwners.passId, passIds),
        })
      : [];

  const passOwnersMap = new Map<string, string[]>();
  for (const o of ownersList) {
    const list = passOwnersMap.get(o.passId) ?? [];
    list.push(o.memberId);
    passOwnersMap.set(o.passId, list);
  }

  // 4. Query pass game states for this pool
  const passGameStatesList = await db.query.passGameStates.findMany({
    where: eq(schema.passGameStates.gamePoolId, gamePoolId),
  });

  const passGameStateMap = new Map<string, typeof passGameStatesList[number]>();
  for (const s of passGameStatesList) {
    passGameStateMap.set(s.passId, s);
  }

  // 5. Query queue entries for this pool ordered strictly by id ASC
  const queueList = await db.query.queueEntries.findMany({
    where: eq(schema.queueEntries.gamePoolId, gamePoolId),
    orderBy: [asc(schema.queueEntries.id)],
  });

  // Assemble passes state
  const passes: PassState[] = passesList.map((p) => {
    const gameState = passGameStateMap.get(p.id);
    return {
      id: p.id,
      sortOrder: p.sortOrder,
      owners: passOwnersMap.get(p.id) ?? [],
      holderMemberId: p.holderMemberId,
      status: (gameState?.status as PassGameStatus) ?? "unindicated",
      indicatedByMemberId: gameState?.indicatedByMemberId ?? null,
      indicatedAt: gameState?.indicatedAt ?? null,
      releasedAt: gameState?.releasedAt ?? null,
      claimantEntryId: gameState?.claimantEntryId ?? null,
      assignedAt: gameState?.assignedAt ?? null,
      updatedAt: gameState?.updatedAt ?? pool.createdAt,
    };
  });

  // Assemble queue state
  const queue: QueueEntryState[] = queueList.map((q) => ({
    id: q.id,
    memberId: q.memberId,
    kind: q.kind as QueueEntryKind,
    guestName: q.guestName,
    status: q.status as QueueEntryStatus,
    assignedPassId: q.assignedPassId,
    assignedAt: q.assignedAt,
    cancelledAt: q.cancelledAt,
    cancelledByMemberId: q.cancelledByMemberId,
    createdAt: q.createdAt,
  }));

  const state: GamePoolState = {
    id: pool.id,
    fixtureId: pool.fixtureId,
    status: pool.status as GamePoolStatus,
    indicationDeadlineAt: pool.indicationDeadlineAt,
    version: pool.version,
    passes,
    queue,
  };

  return {
    state,
    version: pool.version,
  };
}

export function diffToStatements(
  db: DbClient,
  snapshot: LoadedPoolSnapshot,
  resultState: GamePoolState,
  events: ActivityEvent[]
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statements: any[] = [];

  // 1. Check pool changes (status or deadline)
  if (
    snapshot.state.status !== resultState.status ||
    snapshot.state.indicationDeadlineAt !== resultState.indicationDeadlineAt
  ) {
    statements.push(
      db
        .update(schema.gamePools)
        .set({
          status: resultState.status,
          indicationDeadlineAt: resultState.indicationDeadlineAt,
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(schema.gamePools.id, resultState.id))
    );
  }

  // 2. Check queue entry diffs (MUST be before passGameStates due to foreign key claimant_entry_id -> queue_entries.id)
  const oldQueueMap = new Map(snapshot.state.queue.map((q) => [q.id, q]));
  for (const newEntry of resultState.queue) {
    const oldEntry = oldQueueMap.get(newEntry.id);
    if (!oldEntry) {
      // New queue entry inserted
      statements.push(
        db.insert(schema.queueEntries).values({
          id: newEntry.id,
          gamePoolId: resultState.id,
          memberId: newEntry.memberId,
          kind: newEntry.kind,
          guestName: newEntry.guestName,
          status: newEntry.status,
          assignedPassId: newEntry.assignedPassId,
          assignedAt: newEntry.assignedAt,
          cancelledAt: newEntry.cancelledAt,
          cancelledByMemberId: newEntry.cancelledByMemberId,
          createdAt: newEntry.createdAt,
        })
      );
    } else if (
      oldEntry.status !== newEntry.status ||
      oldEntry.assignedPassId !== newEntry.assignedPassId ||
      oldEntry.assignedAt !== newEntry.assignedAt ||
      oldEntry.cancelledAt !== newEntry.cancelledAt ||
      oldEntry.cancelledByMemberId !== newEntry.cancelledByMemberId
    ) {
      // Updated queue entry
      statements.push(
        db
          .update(schema.queueEntries)
          .set({
            status: newEntry.status,
            assignedPassId: newEntry.assignedPassId,
            assignedAt: newEntry.assignedAt,
            cancelledAt: newEntry.cancelledAt,
            cancelledByMemberId: newEntry.cancelledByMemberId,
          })
          .where(eq(schema.queueEntries.id, newEntry.id))
      );
    }
  }

  // 3. Check pass game state diffs
  const oldPassesMap = new Map(snapshot.state.passes.map((p) => [p.id, p]));
  for (const newPass of resultState.passes) {
    const oldPass = oldPassesMap.get(newPass.id);
    if (
      !oldPass ||
      oldPass.status !== newPass.status ||
      oldPass.indicatedByMemberId !== newPass.indicatedByMemberId ||
      oldPass.indicatedAt !== newPass.indicatedAt ||
      oldPass.releasedAt !== newPass.releasedAt ||
      oldPass.claimantEntryId !== newPass.claimantEntryId ||
      oldPass.assignedAt !== newPass.assignedAt
    ) {
      statements.push(
        db
          .insert(schema.passGameStates)
          .values({
            id: `pgs_${resultState.id}_${newPass.id}`,
            gamePoolId: resultState.id,
            passId: newPass.id,
            status: newPass.status,
            indicatedByMemberId: newPass.indicatedByMemberId,
            indicatedAt: newPass.indicatedAt,
            releasedAt: newPass.releasedAt,
            claimantEntryId: newPass.claimantEntryId,
            assignedAt: newPass.assignedAt,
            updatedAt: newPass.updatedAt,
          })
          .onConflictDoUpdate({
            target: [schema.passGameStates.gamePoolId, schema.passGameStates.passId],
            set: {
              status: newPass.status,
              indicatedByMemberId: newPass.indicatedByMemberId,
              indicatedAt: newPass.indicatedAt,
              releasedAt: newPass.releasedAt,
              claimantEntryId: newPass.claimantEntryId,
              assignedAt: newPass.assignedAt,
              updatedAt: newPass.updatedAt,
            },
          })
      );
    }
  }

  // 4. Activity events insertions
  for (const evt of events) {
    statements.push(
      db.insert(schema.activityEvents).values({
        id: evt.id,
        gamePoolId: evt.gamePoolId,
        passId: evt.passId,
        actorMemberId: evt.actorMemberId,
        type: evt.type,
        payloadJson: JSON.stringify(evt.payload),
        idempotencyKey: evt.idempotencyKey ?? null,
        createdAt: evt.createdAt,
      })
    );
  }

  return statements;
}
