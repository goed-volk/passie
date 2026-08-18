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
import { Clock, AlertCircle } from "lucide-react";
import { t, formatDeadlineDateTime } from "@/i18n/t";
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

  const unindicatedOwnedPass = pool.passes.find(
    (p) => p.canIndicate && p.status === "unindicated"
  );

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="max-w-xl mx-auto px-4 sm:px-6 space-y-6 pt-2">
        <TopNav actingMember={pool.actingMember} />
        <FixtureHeader pool={pool} />

        {unindicatedOwnedPass && !pool.deadline.passed && pool.status === "open" && (
          <div className="bg-gradient-to-r from-amber-500/15 to-amber-500/5 dark:from-amber-950/40 dark:to-amber-950/20 border border-amber-500/30 dark:border-amber-500/40 rounded-2xl p-4 flex items-start space-x-3.5 shadow-xs">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {t("deadlineReminderTitle")}
              </h3>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {t("deadlineReminderDesc", {
                  deadline: formatDeadlineDateTime(pool.deadline.at),
                })}
              </p>
            </div>
          </div>
        )}

        {unindicatedOwnedPass && pool.deadline.passed && pool.status === "open" && (
          <div className="bg-red-500/10 dark:bg-red-950/30 border border-red-500/30 dark:border-red-500/40 rounded-2xl p-4 flex items-start space-x-3.5 shadow-xs">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {t("deadlinePassed")}
              </h3>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {t("deadlinePassedBanner")}
              </p>
            </div>
          </div>
        )}

        <PassList
          passes={pool.passes}
          fixtureOpponent={pool.fixture.opponent}
          allMembers={pool.members}
          onIndicate={async (passId, action) => {
            await indicatePass({ passId, action });
          }}
          onTransfer={async (passId, toMemberId) => {
            await transferPass({ passId, toMemberId, fixtureId: pool.fixture.id });
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
        unindicatedPass={unindicatedOwnedPass}
        onIndicate={async (passId, action) => {
          await indicatePass({ passId, action });
        }}
        onJoin={async (kind, guestName) => {
          await joinQueue({ kind, guestName });
        }}
        loading={isMutating}
      />
    </div>
  );
}
