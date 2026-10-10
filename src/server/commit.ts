import { and, eq } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";
import { loadGamePoolState, diffToStatements } from "./repo";
import { reduce } from "../domain/engine";
import type { Action, MemberId, DomainError, ReduceContext, ActivityEventType } from "../domain/types";

export interface MutateOptions {
  idempotencyKey?: string | null;
  maxAttempts?: number;
  now?: number;
}

export type MutateResult =
  | {
      ok: true;
      version: number;
    }
  | {
      ok: false;
      error:
        | DomainError
        | {
            code:
              | "CONFLICT_RETRY_EXHAUSTED"
              | "POOL_NOT_FOUND"
              | "IDEMPOTENT_REPLAY"
              | "INTERNAL_ERROR";
            message: string;
          };
    };

export async function mutate(
  db: DbClient,
  gamePoolId: string,
  action: Action,
  actor: MemberId | null,
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

    const now = options?.now ?? Math.floor(Date.now() / 1000);
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
        (errStr.includes("pool_version_guards") &&
          (errStr.includes("UNIQUE") ||
            errStr.includes("PRIMARYKEY") ||
            errStr.includes("constraint") ||
            errStr.includes("SQLITE_CONSTRAINT"))) ||
        (errStr.includes("activity_events") && errStr.includes("idempotency_key"));

      if (!isSentinelConflict) {
        // Fatal non-concurrency error (e.g. syntax, foreign key corruption)
        console.error("Non-retryable database error during mutate:", err);
        await captureServerDatabaseError(gamePoolId, err, action);
        return {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "An internal database error occurred",
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

async function captureServerDatabaseError(
  gamePoolId: string,
  err: unknown,
  action: Action
): Promise<void> {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!posthogKey) return;

  const errName = err instanceof Error ? err.name : "UnknownError";
  const rawMsg = err instanceof Error ? err.message : String(err);
  // Redact potential PII (e.g. quoted string literals in SQLite errors)
  const sanitize = (str: string) =>
    str
      .replace(/'[^']*'/g, "'[redacted]'")
      .replace(/"[^"]*"/g, '"[redacted]"');

  const sanitizedMsg = sanitize(rawMsg).slice(0, 500);
  const sanitizedStack =
    err instanceof Error && err.stack ? sanitize(err.stack).slice(0, 1000) : undefined;

  const env =
    process.env.NEXT_PUBLIC_PASSIE_ENV ||
    (process.env.NODE_ENV === "production" ? "production" : "development");

  const payload = {
    api_key: posthogKey,
    event: "$exception",
    distinct_id: `pool_${gamePoolId}`,
    properties: {
      $exception_type: errName,
      $exception_message: sanitizedMsg,
      $exception_stack_trace: sanitizedStack,
      $exception_list: [
        {
          type: errName,
          value: sanitizedMsg,
        },
      ],
      $process_person_profile: false,
      game_pool_id: gamePoolId,
      action_type: action.type,
      environment: env,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    await fetch("https://eu.i.posthog.com/capture/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // Non-blocking fallback: never fail mutation return on analytics delivery
  }
}
