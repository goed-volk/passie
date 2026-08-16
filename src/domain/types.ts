// Pure domain types - no external dependencies, no framework imports.

export type MemberId = string;
export type PassId = string;
export type GamePoolId = string;
export type QueueEntryId = number;
export type FixtureId = string;
export type ActivityEventId = string;

export type GamePoolStatus = "open" | "closed" | "cancelled";
export type PassGameStatus = "unindicated" | "kept" | "released" | "assigned";
export type QueueEntryKind = "self" | "guest";
export type QueueEntryStatus = "waiting" | "assigned" | "cancelled";

export interface PassState {
  id: PassId;
  sortOrder: number;
  owners: MemberId[];
  holderMemberId: MemberId | null;
  status: PassGameStatus;
  indicatedByMemberId: MemberId | null;
  indicatedAt: number | null;
  releasedAt: number | null;
  claimantEntryId: QueueEntryId | null;
  assignedAt: number | null;
  updatedAt: number;
}

export interface QueueEntryState {
  id: QueueEntryId;
  memberId: MemberId;
  kind: QueueEntryKind;
  guestName: string | null;
  status: QueueEntryStatus;
  assignedPassId: PassId | null;
  assignedAt: number | null;
  cancelledAt: number | null;
  cancelledByMemberId: MemberId | null;
  createdAt: number;
}

export interface GamePoolState {
  id: GamePoolId;
  fixtureId: FixtureId;
  status: GamePoolStatus;
  indicationDeadlineAt: number;
  version: number;
  passes: PassState[];
  queue: QueueEntryState[];
}

export type ActivityEventType =
  | "pool.opened"
  | "pass.kept"
  | "pass.released"
  | "pass.assigned"
  | "pass.unassigned"
  | "queue.joined"
  | "queue.cancelled"
  | "queue.assigned"
  | "possession.handover"
  | "possession.corrected"
  | "fixture.rescheduled"
  | "fixture.cancelled";

export interface ActivityEvent {
  id: ActivityEventId;
  gamePoolId: GamePoolId | null;
  passId: PassId | null;
  actorMemberId: MemberId | null;
  type: ActivityEventType;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
  createdAt: number;
}

export type DomainErrorCode =
  | "POOL_NOT_OPEN"
  | "NOT_PASS_OWNER"
  | "PASS_ALREADY_ASSIGNED"
  | "PASS_NOT_ASSIGNED"
  | "NOT_CLAIMANT"
  | "QUEUE_ENTRY_NOT_FOUND"
  | "QUEUE_ENTRY_NOT_WAITING"
  | "NOT_QUEUE_ENTRY_OWNER"
  | "PASS_NOT_FOUND"
  | "INVALID_ACTION";

export interface DomainError {
  code: DomainErrorCode;
  message: string;
}

export type Action =
  | {
      type: "IndicateKeep";
      passId: PassId;
    }
  | {
      type: "IndicateRelease";
      passId: PassId;
    }
  | {
      type: "JoinQueue";
      nextEntryId: QueueEntryId;
      kind: QueueEntryKind;
      guestName?: string | null;
    }
  | {
      type: "CancelQueueEntry";
      entryId: QueueEntryId;
    }
  | {
      type: "GiveBackAssignedPass";
      passId: PassId;
    }
  | {
      type: "RecordHandover";
      passId: PassId;
      toMemberId: MemberId;
      kind?: "handover" | "correction";
      note?: string | null;
    }
  | {
      type: "MarkFixtureRescheduled";
      newKickoffAt: number;
      newDeadlineAt: number;
    }
  | {
      type: "MarkFixtureCancelled";
    };

export interface ReduceContext {
  now: number; // Unix seconds UTC
  actor: MemberId | null;
  nextEventId: (type: ActivityEventType) => ActivityEventId;
  idempotencyKey?: string | null;
}
