import { and, eq, sql } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";
import { loadGamePoolState, diffToStatements } from "./repo";
import { reduce } from "../domain/engine";
import type { Action, MemberId, DomainError, ReduceContext, ActivityEventType } from "../domain/types";

export interface MutateOptions {
  idempotencyKey?: string | null;
  maxAttempts?: number;
}

export type MutateResult =
  | {
      ok: true;
      version: number;
    }
  | {
      ok: false;
      error: DomainError | { code: "CONFLICT_RETRY_EXHAUSTED" | "POOL_NOT_FOUND" | "IDEMPOTENT_REPLAY"; message: string };
    };

export async function mutate(
  db: DbClient,
  gamePoolId: string,
  action: Action,
  actor: MemberId,
  options?: MutateOptions
): Promise<MutateResult> {
  const maxAttempts = options?.maxAttempts ?? 8;
  const idempotencyKey = options?.idempotencyKey ?? null;

  // Check if idempotency key was already recorded
  if (idempotencyKey) {
    const existingEvent = await db.query.activityEvents.findFirst({
      where: eq(schema.activityEvents.idempotencyKey, idempotencyKey),
    });
    if (existingEvent) {
      const snapshot = await loadGamePoolState(db, gamePoolId);
      return {
        ok: true,
        version: snapshot?.version ?? 0,
      };
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // Jitter backoff between retries to avoid contention thundering herd
      const delayMs = 15 * attempt + Math.floor((Date.now() % 37));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const snapshot = await loadGamePoolState(db, gamePoolId);
    if (!snapshot) {
      return {
        ok: false,
        error: {
          code: "POOL_NOT_FOUND",
          message: `Game pool ${gamePoolId} not found`,
        },
      };
    }

    const now = Math.floor(Date.now() / 1000);
    let eventCounter = 0;

    // For JoinQueue, calculate the next auto-increment id in memory for the reducer
    let nextEntryId = 1;
    if (action.type === "JoinQueue") {
      const maxIdResult = await db
        .select({ maxId: sql<number | null>`max(${schema.queueEntries.id})` })
        .from(schema.queueEntries);
      nextEntryId = (maxIdResult[0]?.maxId ?? 0) + 1;
      action = {
        ...action,
        nextEntryId,
      };
    }

    const ctx: ReduceContext = {
      now,
      actor,
      nextEventId: (type: ActivityEventType) => `evt_${Date.now()}_${++eventCounter}_${type}`,
      idempotencyKey,
    };

    const result = reduce(snapshot.state, action, ctx);
    if ("error" in result) {
      return {
        ok: false,
        error: result.error,
      };
    }

    const writes = diffToStatements(db, snapshot, result.state, result.events);

    // If there are no diff statements or events to write, commit is trivially successful
    if (writes.length === 0) {
      return {
        ok: true,
        version: snapshot.version,
      };
    }

    const guard = db
      .update(schema.gamePools)
      .set({
        version: snapshot.version + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.gamePools.id, gamePoolId),
          eq(schema.gamePools.version, snapshot.version)
        )
      );

    try {
      // Execute atomic batch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchResults = (await db.batch([guard, ...writes] as any)) as Array<{
        meta?: { changes?: number };
      }>;

      const guardResult = batchResults[0];
      if (guardResult && guardResult.meta?.changes === 1) {
        return {
          ok: true,
          version: snapshot.version + 1,
        };
      }
    } catch (err: unknown) {
      // If a concurrent transaction landed first and caused a constraint conflict,
      // allow optimistic retry up to maxAttempts.
      if (attempt === maxAttempts - 1) {
        return {
          ok: false,
          error: {
            code: "CONFLICT_RETRY_EXHAUSTED",
            message: `Conflict retry exhausted: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }
    }

    // Optimistic concurrency conflict detected -> loop and retry
  }

  return {
    ok: false,
    error: {
      code: "CONFLICT_RETRY_EXHAUSTED",
      message: "Concurrent mutation conflict: please retry",
    },
  };
}
