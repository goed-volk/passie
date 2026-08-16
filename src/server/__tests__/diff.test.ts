import { describe, it, expect } from "vitest";
import { diffToStatements, type LoadedPoolSnapshot } from "../repo";
import type { GamePoolState, ActivityEvent } from "../../domain/types";
import type { DbClient } from "../db";

// Mock db client that builds statement descriptors
const mockDb = {
  update: (table: unknown) => ({
    set: (values: unknown) => ({
      where: (condition: unknown) => ({
        type: "update",
        table,
        values,
        condition,
      }),
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: unknown) => ({
      type: "insert",
      table,
      values,
      onConflictDoUpdate: (config: unknown) => ({
        type: "insert_on_conflict_update",
        table,
        values,
        config,
      }),
    }),
  }),
} as unknown as DbClient;

describe("diffToStatements", () => {
  it("maintains strict statement order: queue_entries before pass_game_states", () => {
    const snapshot: LoadedPoolSnapshot = {
      version: 1,
      nextQueueEntryId: 2,
      state: {
        id: "pool_1",
        fixtureId: "fix_1",
        status: "open",
        indicationDeadlineAt: 1700000000,
        version: 1,
        passes: [
          {
            id: "pass_1",
            sortOrder: 1,
            owners: ["member_sam"],
            holderMemberId: "member_sam",
            status: "released",
            indicatedByMemberId: "member_sam",
            indicatedAt: 1700000000,
            releasedAt: 1700000000,
            claimantEntryId: null,
            assignedAt: null,
            updatedAt: 1700000000,
          },
        ],
        queue: [],
      },
    };

    const resultState: GamePoolState = {
      ...snapshot.state,
      passes: [
        {
          ...snapshot.state.passes[0]!,
          status: "assigned",
          claimantEntryId: 1,
          assignedAt: 1700000010,
          updatedAt: 1700000010,
        },
      ],
      queue: [
        {
          id: 1,
          memberId: "member_daan",
          kind: "self",
          guestName: null,
          status: "assigned",
          assignedPassId: "pass_1",
          assignedAt: 1700000010,
          cancelledAt: null,
          cancelledByMemberId: null,
          createdAt: 1700000010,
        },
      ],
    };

    const events: ActivityEvent[] = [
      {
        id: "evt_1",
        gamePoolId: "pool_1",
        passId: null,
        actorMemberId: "member_daan",
        type: "queue.joined",
        payload: { entryId: 1, memberId: "member_daan" },
        idempotencyKey: "root-key-1",
        createdAt: 1700000010,
      },
      {
        id: "evt_2",
        gamePoolId: "pool_1",
        passId: "pass_1",
        actorMemberId: "member_daan",
        type: "pass.assigned",
        payload: { passId: "pass_1", claimantEntryId: 1 },
        idempotencyKey: null,
        createdAt: 1700000010,
      },
    ];

    const statements = diffToStatements(mockDb, snapshot, resultState, events) as Array<{
      type: string;
      values: Record<string, unknown>;
    }>;

    expect(statements.length).toBe(4);

    // Statement 0: queue_entries insert
    expect(statements[0]?.values.id).toBe(1);
    expect(statements[0]?.values.gamePoolId).toBe("pool_1");

    // Statement 1: pass_game_states insert/update (depends on queue_entries FK)
    expect(statements[1]?.values.passId).toBe("pass_1");
    expect(statements[1]?.values.claimantEntryId).toBe(1);

    // Statement 2 & 3: activity events
    expect(statements[2]?.values.id).toBe("evt_1");
    expect(statements[2]?.values.idempotencyKey).toBe("root-key-1");
    expect(statements[3]?.values.id).toBe("evt_2");
    expect(statements[3]?.values.idempotencyKey).toBeNull();
  });

  it("returns empty statements array if state and events have no changes", () => {
    const snapshot: LoadedPoolSnapshot = {
      version: 1,
      nextQueueEntryId: 1,
      state: {
        id: "pool_1",
        fixtureId: "fix_1",
        status: "open",
        indicationDeadlineAt: 1700000000,
        version: 1,
        passes: [],
        queue: [],
      },
    };

    const statements = diffToStatements(mockDb, snapshot, snapshot.state, []);
    expect(statements).toHaveLength(0);
  });
});

