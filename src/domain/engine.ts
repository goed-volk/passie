// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure reducer engine: (State, Action, Context) -> { state, events } | { error }
// Absolutely no framework imports, no Date.now(), no Math.random(), no D1 / Drizzle imports.

import type {
  GamePoolState,
  Action,
  ReduceContext,
  ActivityEvent,
  DomainError,
  PassState,
} from "./types";
import { runAllocation } from "./allocation";

export type ReduceResult =
  | {
      state: GamePoolState;
      events: ActivityEvent[];
    }
  | {
      error: DomainError;
    };

export function reduce(
  state: GamePoolState,
  action: Action,
  ctx: ReduceContext
): ReduceResult {
  // Pool status guard: Only MarkFixtureRescheduled, MarkFixtureCancelled, and RecordHandover can run on non-open pools.
  if (
    state.status !== "open" &&
    action.type !== "MarkFixtureRescheduled" &&
    action.type !== "MarkFixtureCancelled" &&
    action.type !== "RecordHandover"
  ) {
    return {
      error: {
        code: "POOL_NOT_OPEN",
        message: `Cannot execute action ${action.type} on pool with status ${state.status}`,
      },
    };
  }

  switch (action.type) {
    case "IndicateKeep": {
      const passIndex = state.passes.findIndex((p) => p.id === action.passId);
      if (passIndex === -1) {
        return {
          error: {
            code: "PASS_NOT_FOUND",
            message: `Pass ${action.passId} not found in game pool`,
          },
        };
      }

      const pass = state.passes[passIndex]!;
      const actor = ctx.actor;
      if (!actor || !pass.owners.includes(actor)) {
        return {
          error: {
            code: "NOT_PASS_OWNER",
            message: `Member ${actor ?? "unknown"} is not an owner of pass ${action.passId}`,
          },
        };
      }

      // If already assigned, owner cannot revoke through the app
      if (pass.status === "assigned") {
        return {
          error: {
            code: "PASS_ALREADY_ASSIGNED",
            message: `Pass ${action.passId} is already assigned to a queue claimant`,
          },
        };
      }

      // Idempotency: if already kept by this actor, return state as-is
      if (pass.status === "kept" && pass.indicatedByMemberId === ctx.actor) {
        return {
          state,
          events: [],
        };
      }

      const updatedPass: PassState = {
        ...pass,
        status: "kept",
        indicatedByMemberId: ctx.actor,
        indicatedAt: ctx.now,
        releasedAt: null,
        claimantEntryId: null,
        assignedAt: null,
        updatedAt: ctx.now,
      };

      const newPasses = [...state.passes];
      newPasses[passIndex] = updatedPass;

      const event: ActivityEvent = {
        id: ctx.nextEventId("pass.kept"),
        gamePoolId: state.id,
        passId: pass.id,
        actorMemberId: ctx.actor,
        type: "pass.kept",
        payload: {
          passId: pass.id,
        },
        idempotencyKey: ctx.idempotencyKey,
        createdAt: ctx.now,
      };

      return {
        state: {
          ...state,
          passes: newPasses,
        },
        events: [event],
      };
    }

    case "IndicateRelease": {
      const passIndex = state.passes.findIndex((p) => p.id === action.passId);
      if (passIndex === -1) {
        return {
          error: {
            code: "PASS_NOT_FOUND",
            message: `Pass ${action.passId} not found in game pool`,
          },
        };
      }

      const pass = state.passes[passIndex]!;
      const actor = ctx.actor;
      if (!actor || !pass.owners.includes(actor)) {
        return {
          error: {
            code: "NOT_PASS_OWNER",
            message: `Member ${actor ?? "unknown"} is not an owner of pass ${action.passId}`,
          },
        };
      }

      // Idempotency: if already assigned, or already released, check if any waiting entry needs reconciliation
      if (pass.status === "assigned") {
        return {
          state,
          events: [],
        };
      }

      if (pass.status === "released") {
        // If already released, run allocation reconciliation in case a queue entry joined in between
        const allocation = runAllocation(
          state.passes,
          state.queue,
          ctx,
          state.id
        );

        if (allocation.events.length > 0) {
          return {
            state: {
              ...state,
              passes: allocation.passes,
              queue: allocation.queue,
            },
            events: allocation.events,
          };
        }

        return {
          state,
          events: [],
        };
      }

      const updatedPass: PassState = {
        ...pass,
        status: "released",
        indicatedByMemberId: ctx.actor,
        indicatedAt: pass.indicatedAt ?? ctx.now,
        releasedAt: ctx.now,
        claimantEntryId: null,
        assignedAt: null,
        updatedAt: ctx.now,
      };

      const intermediatePasses = [...state.passes];
      intermediatePasses[passIndex] = updatedPass;

      const releaseEvent: ActivityEvent = {
        id: ctx.nextEventId("pass.released"),
        gamePoolId: state.id,
        passId: pass.id,
        actorMemberId: ctx.actor,
        type: "pass.released",
        payload: {
          passId: pass.id,
        },
        idempotencyKey: ctx.idempotencyKey,
        createdAt: ctx.now,
      };

      // Run allocation immediately to pair with any waiting entry
      const allocation = runAllocation(
        intermediatePasses,
        state.queue,
        ctx,
        state.id
      );

      return {
        state: {
          ...state,
          passes: allocation.passes,
          queue: allocation.queue,
        },
        events: [releaseEvent, ...allocation.events],
      };
    }

    case "JoinQueue": {
      if (!ctx.actor) {
        return {
          error: {
            code: "INVALID_ACTION",
            message: "Actor required for JoinQueue",
          },
        };
      }

      // Create new queue entry
      const newEntry = {
        id: action.nextEntryId,
        memberId: ctx.actor,
        kind: action.kind,
        guestName: action.kind === "guest" ? action.guestName ?? null : null,
        status: "waiting" as const,
        assignedPassId: null,
        assignedAt: null,
        cancelledAt: null,
        cancelledByMemberId: null,
        createdAt: ctx.now,
      };

      const intermediateQueue = [...state.queue, newEntry];

      const joinEvent: ActivityEvent = {
        id: ctx.nextEventId("queue.joined"),
        gamePoolId: state.id,
        passId: null,
        actorMemberId: ctx.actor,
        type: "queue.joined",
        payload: {
          entryId: newEntry.id,
          memberId: ctx.actor,
          kind: action.kind,
          guestName: newEntry.guestName,
        },
        idempotencyKey: ctx.idempotencyKey,
        createdAt: ctx.now,
      };

      // Run allocation immediately in case a released pass is waiting
      const allocation = runAllocation(
        state.passes,
        intermediateQueue,
        ctx,
        state.id
      );

      return {
        state: {
          ...state,
          passes: allocation.passes,
          queue: allocation.queue,
        },
        events: [joinEvent, ...allocation.events],
      };
    }

    case "CancelQueueEntry": {
      const entryIndex = state.queue.findIndex((q) => q.id === action.entryId);
      if (entryIndex === -1) {
        return {
          error: {
            code: "QUEUE_ENTRY_NOT_FOUND",
            message: `Queue entry ${action.entryId} not found`,
          },
        };
      }

      const entry = state.queue[entryIndex]!;
      if (entry.memberId !== ctx.actor) {
        return {
          error: {
            code: "NOT_QUEUE_ENTRY_OWNER",
            message: `Member ${ctx.actor} does not own queue entry ${action.entryId}`,
          },
        };
      }

      if (entry.status !== "waiting") {
        return {
          error: {
            code: "QUEUE_ENTRY_NOT_WAITING",
            message: `Queue entry ${action.entryId} is not waiting (status: ${entry.status})`,
          },
        };
      }

      const updatedEntry = {
        ...entry,
        status: "cancelled" as const,
        cancelledAt: ctx.now,
        cancelledByMemberId: ctx.actor,
      };

      const newQueue = [...state.queue];
      newQueue[entryIndex] = updatedEntry;

      const cancelEvent: ActivityEvent = {
        id: ctx.nextEventId("queue.cancelled"),
        gamePoolId: state.id,
        passId: null,
        actorMemberId: ctx.actor,
        type: "queue.cancelled",
        payload: {
          entryId: entry.id,
          memberId: entry.memberId,
        },
        idempotencyKey: ctx.idempotencyKey,
        createdAt: ctx.now,
      };

      return {
        state: {
          ...state,
          queue: newQueue,
        },
        events: [cancelEvent],
      };
    }

    case "GiveBackAssignedPass": {
      const passIndex = state.passes.findIndex((p) => p.id === action.passId);
      if (passIndex === -1) {
        return {
          error: {
            code: "PASS_NOT_FOUND",
            message: `Pass ${action.passId} not found in game pool`,
          },
        };
      }

      const pass = state.passes[passIndex]!;
      if (pass.status !== "assigned" || pass.claimantEntryId === null) {
        return {
          error: {
            code: "PASS_NOT_ASSIGNED",
            message: `Pass ${action.passId} is not currently assigned`,
          },
        };
      }

      const entryIndex = state.queue.findIndex((q) => q.id === pass.claimantEntryId);
      if (entryIndex === -1) {
        return {
          error: {
            code: "QUEUE_ENTRY_NOT_FOUND",
            message: `Claimant queue entry ${pass.claimantEntryId} not found`,
          },
        };
      }

      const entry = state.queue[entryIndex]!;
      // Only the claimant member who requested the seat may give it back
      if (entry.memberId !== ctx.actor) {
        return {
          error: {
            code: "NOT_CLAIMANT",
            message: `Member ${ctx.actor ?? "unknown"} is not the claimant of pass ${action.passId}`,
          },
        };
      }

      // Mark claimant entry as cancelled
      const updatedEntry = {
        ...entry,
        status: "cancelled" as const,
        cancelledAt: ctx.now,
        cancelledByMemberId: ctx.actor,
      };

      const updatedPass: PassState = {
        ...pass,
        status: "released",
        claimantEntryId: null,
        assignedAt: null,
        updatedAt: ctx.now,
      };

      const intermediatePasses = [...state.passes];
      intermediatePasses[passIndex] = updatedPass;

      const intermediateQueue = [...state.queue];
      intermediateQueue[entryIndex] = updatedEntry;

      const unassignedEvent: ActivityEvent = {
        id: ctx.nextEventId("pass.unassigned"),
        gamePoolId: state.id,
        passId: pass.id,
        actorMemberId: ctx.actor,
        type: "pass.unassigned",
        payload: {
          passId: pass.id,
          previousClaimantEntryId: entry.id,
          previousClaimantMemberId: entry.memberId,
        },
        idempotencyKey: ctx.idempotencyKey,
        createdAt: ctx.now,
      };

      // Re-run allocation to immediately assign the released pass to the next waiting entry if any
      const allocation = runAllocation(
        intermediatePasses,
        intermediateQueue,
        ctx,
        state.id
      );

      return {
        state: {
          ...state,
          passes: allocation.passes,
          queue: allocation.queue,
        },
        events: [unassignedEvent, ...allocation.events],
      };
    }

    case "RecordHandover": {
      const passIndex = state.passes.findIndex((p) => p.id === action.passId);
      if (passIndex === -1) {
        return {
          error: {
            code: "PASS_NOT_FOUND",
            message: `Pass ${action.passId} not found in game pool`,
          },
        };
      }

      const pass = state.passes[passIndex]!;
      const fromMemberId = pass.holderMemberId;
      const kind = action.kind ?? "handover";

      // Idempotency: if already held by toMemberId, return state as-is with no events
      if (fromMemberId === action.toMemberId) {
        return {
          state,
          events: [],
        };
      }

      const updatedPass: PassState = {
        ...pass,
        holderMemberId: action.toMemberId,
        updatedAt: ctx.now,
      };

      const newPasses = [...state.passes];
      newPasses[passIndex] = updatedPass;

      const eventType = kind === "correction" ? "possession.corrected" : "possession.handover";
      const event: ActivityEvent = {
        id: ctx.nextEventId(eventType),
        gamePoolId: state.id,
        passId: pass.id,
        actorMemberId: ctx.actor,
        type: eventType,
        payload: {
          passId: pass.id,
          fromMemberId,
          toMemberId: action.toMemberId,
          kind,
          note: action.note ?? null,
        },
        idempotencyKey: ctx.idempotencyKey,
        createdAt: ctx.now,
      };

      return {
        state: {
          ...state,
          passes: newPasses,
        },
        events: [event],
      };
    }

    case "MarkFixtureRescheduled": {
      const rescheduleEvent: ActivityEvent = {
        id: ctx.nextEventId("fixture.rescheduled"),
        gamePoolId: state.id,
        passId: null,
        actorMemberId: ctx.actor,
        type: "fixture.rescheduled",
        payload: {
          newKickoffAt: action.newKickoffAt,
          newDeadlineAt: action.newDeadlineAt,
        },
        idempotencyKey: ctx.idempotencyKey,
        createdAt: ctx.now,
      };

      return {
        state: {
          ...state,
          indicationDeadlineAt: action.newDeadlineAt,
        },
        events: [rescheduleEvent],
      };
    }

    case "MarkFixtureCancelled": {
      const cancelEvent: ActivityEvent = {
        id: ctx.nextEventId("fixture.cancelled"),
        gamePoolId: state.id,
        passId: null,
        actorMemberId: ctx.actor,
        type: "fixture.cancelled",
        payload: {},
        idempotencyKey: ctx.idempotencyKey,
        createdAt: ctx.now,
      };

      return {
        state: {
          ...state,
          status: "cancelled",
        },
        events: [cancelEvent],
      };
    }
  }
}
