import { and, eq } from "drizzle-orm";
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

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // Jitter backoff between retries to avoid contention thundering herd
      const delayMs = 15 * attempt + Math.floor(Math.random() * 37);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Check if idempotency key was already recorded (either before or during a retry)
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

    // For JoinQueue, use monotonic nextQueueEntryId derived from snapshot
    if (action.type === "JoinQueue") {
      action = {
        ...action,
        nextEntryId: snapshot.nextQueueEntryId,
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

    const targetVersion = snapshot.version + 1;

    // 1. Hard version sentinel: inserting (gamePoolId, targetVersion) fails HARD if another transaction
    // already committed targetVersion, causing D1 to abort and roll back the whole batch.
    const sentinelGuard = db
      .insert(schema.poolVersionGuards)
      .values({
        gamePoolId,
        version: targetVersion,
        createdAt: now,
      });

    // 2. Pool version update
    const poolUpdate = db
      .update(schema.gamePools)
      .set({
        version: targetVersion,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.gamePools.id, gamePoolId),
          eq(schema.gamePools.version, snapshot.version)
        )
      );

    try {
      // Execute atomic batch with sentinel guard first
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const batchResults = (await db.batch([sentinelGuard, poolUpdate, ...writes] as any)) as Array<{
        meta?: { changes?: number };
      }>;

      const poolUpdateResult = batchResults[1];
      if (poolUpdateResult && poolUpdateResult.meta?.changes === 1) {
        return {
          ok: true,
          version: targetVersion,
        };
      }
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      const isSentinelConflict =
        errStr.includes("pool_version_guards") ||
        errStr.includes("UNIQUE constraint failed") ||
        errStr.includes("SQLITE_CONSTRAINT_PRIMARYKEY") ||
        errStr.includes("SQLITE_CONSTRAINT");

      if (!isSentinelConflict) {
        // Fatal non-concurrency error (e.g. syntax, foreign key corruption)
        console.error("Non-retryable database error during mutate:", err);
        return {
          ok: false,
          error: {
            code: "CONFLICT_RETRY_EXHAUSTED",
            message: "Database mutation error",
          },
        };
      }

      // If max attempts exhausted on genuine concurrency conflicts
      if (attempt === maxAttempts - 1) {
        return {
          ok: false,
          error: {
            code: "CONFLICT_RETRY_EXHAUSTED",
            message: "Concurrent mutation conflict: please retry",
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
