"use client";

import { useEffect } from "react";
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
import { trackMemberIdentity } from "@/lib/posthog";
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

  const actingMember = pool?.actingMember;
  useEffect(() => {
    if (actingMember) {
      trackMemberIdentity(actingMember);
    }
  }, [actingMember]);

  if (!pool) {
    return (
      <div className="max-w-xl mx-auto p-4 space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const isMutating = isIndicating || isJoining || isCancelling || isTransferring;
  const isPostMatch = pool.deadline.isPostMatch;
  const isPoolOpen = pool.status === "open" && !isPostMatch;

  const unindicatedOwnedPasses = pool.passes.filter(
    (p) => p.canIndicate && p.status === "unindicated"
  );
  const hasUnindicatedOwnedPasses = unindicatedOwnedPasses.length > 0;

  return (
    <div
      className={`min-h-[100dvh] bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 ${
        isPoolOpen ? "pb-[calc(7rem+env(safe-area-inset-bottom))]" : "pb-16"
      }`}
    >
      <div className="max-w-xl mx-auto px-4 sm:px-6 space-y-6 pt-2">
        <TopNav actingMember={pool.actingMember} />
        <FixtureHeader pool={pool} />

        {pool.status === "cancelled" && (
          <div className="bg-red-500/10 dark:bg-red-950/30 border border-red-500/30 dark:border-red-500/40 rounded-2xl p-4 flex items-start space-x-3.5 shadow-xs">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {t("poolCancelled")}
              </h3>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                Deze wedstrijd is afgelast of verplaatst. Aanmelden is niet meer mogelijk.
              </p>
            </div>
          </div>
        )}

        {pool.status === "closed" && !isPostMatch && (
          <div className="bg-slate-500/10 dark:bg-slate-950/30 border border-slate-500/30 dark:border-slate-500/40 rounded-2xl p-4 flex items-start space-x-3.5 shadow-xs">
            <AlertCircle className="h-5 w-5 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Aanmelding gesloten
              </h3>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                De aanmelding voor deze wedstrijd is gesloten.
              </p>
            </div>
          </div>
        )}

        {isPostMatch && pool.status !== "cancelled" && (
          <div className="bg-slate-500/10 dark:bg-slate-950/30 border border-slate-500/30 dark:border-slate-500/40 rounded-2xl p-4 flex items-start space-x-3.5 shadow-xs">
            <Clock className="h-5 w-5 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {t("matchFinishedBannerTitle")}
              </h3>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {t("matchFinishedBannerDesc")}
              </p>
            </div>
          </div>
        )}

        {hasUnindicatedOwnedPasses && !pool.deadline.passed && isPoolOpen && (
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

        {hasUnindicatedOwnedPasses && pool.deadline.passed && isPoolOpen && (
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
            try {
              await indicatePass({ passId, action });
            } catch {
              // Error handled by mutation toast
            }
          }}
          onTransfer={async (passId, toMemberId) => {
            try {
              await transferPass({ passId, toMemberId, fixtureId: pool.fixture.id });
            } catch {
              // Error handled by mutation toast
            }
          }}
          loading={isMutating}
        />

        <QueueList
          queue={pool.queue}
          onCancelEntry={async (entryId) => {
            try {
              await cancelQueueEntry(entryId);
            } catch {
              // Error handled by mutation toast
            }
          }}
          loading={isMutating}
        />

        <TransferTasks
          transfers={pool.transfers}
          fixtureId={pool.fixture.id}
          onTransfer={async (passId, toMemberId, fixtureId) => {
            try {
              await transferPass({ passId, toMemberId, fixtureId });
            } catch {
              // Error handled by mutation toast
            }
          }}
          loading={isMutating}
        />

        <ActivityTimeline timeline={pool.timeline} />
      </div>

      {isPoolOpen && (
        <QueueJoinSheet
          unindicatedPasses={unindicatedOwnedPasses}
          onIndicate={async (passId, action) => {
            try {
              await indicatePass({ passId, action });
            } catch {
              // Error handled by mutation toast
            }
          }}
          onJoin={async (kind, guestName) => {
            try {
              await joinQueue({ kind, guestName });
            } catch {
              // Error handled by mutation toast
            }
          }}
          loading={isMutating}
        />
      )}
    </div>
  );
}
