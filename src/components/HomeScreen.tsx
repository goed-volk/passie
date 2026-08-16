"use client";

import { usePool } from "@/hooks/usePool";
import { FixtureHeader } from "@/components/FixtureHeader";
import { PassList } from "@/components/PassList";
import { QueueList } from "@/components/QueueList";
import { QueueJoinSheet } from "@/components/QueueJoinSheet";
import { TransferTasks } from "@/components/TransferTasks";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { TopNav } from "@/components/TopNav";
import { Skeleton } from "@/components/ui/skeleton";
import type { PoolSnapshot } from "@/server/snapshot";

export function HomeScreen({
  gamePoolId,
  initialSnapshot,
}: {
  gamePoolId: string;
  initialSnapshot: PoolSnapshot;
}) {
  const {
    pool,
    indicatePass,
    isIndicating,
    joinQueue,
    isJoining,
    cancelQueueEntry,
    isCancelling,
    transferPass,
    isTransferring,
  } = usePool(gamePoolId, initialSnapshot);

  if (!pool) {
    return (
      <div className="max-w-xl mx-auto p-4 space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const isMutating = isIndicating || isJoining || isCancelling || isTransferring;

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 pb-28">
      <div className="max-w-xl mx-auto px-4 sm:px-6 space-y-6 pt-2">
        <TopNav actingMember={pool.actingMember} />
        <FixtureHeader pool={pool} />

        <PassList
          passes={pool.passes}
          onIndicate={async (passId, action) => {
            await indicatePass({ passId, action });
          }}
          loading={isMutating}
        />

        <QueueList
          queue={pool.queue}
          onCancelEntry={async (entryId) => {
            await cancelQueueEntry(entryId);
          }}
          loading={isMutating}
        />

        <TransferTasks
          transfers={pool.transfers}
          fixtureId={pool.fixture.id}
          onTransfer={async (passId, toMemberId, fixtureId) => {
            await transferPass({ passId, toMemberId, fixtureId });
          }}
          loading={isMutating}
        />

        <ActivityTimeline timeline={pool.timeline} />
      </div>

      <QueueJoinSheet
        onJoin={async (kind, guestName) => {
          await joinQueue({ kind, guestName });
        }}
        loading={isMutating}
      />
    </div>
  );
}
