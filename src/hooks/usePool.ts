"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PoolSnapshot } from "@/server/snapshot";
import { nl } from "@/i18n/nl";
import { t } from "@/i18n/t";
import {
  getHoursToKickoffBucket,
  trackIndicateKeep,
  trackIndicateRelease,
  trackReclaim,
  trackQueueJoinSelf,
  trackQueueJoinGuest,
  trackQueueCancel,
  trackGiveBack,
  trackHandover,
} from "@/lib/posthog";

function parseAndTranslateError(
  resStatus: number,
  errorData?: { error?: string; code?: string }
): string {
  if (resStatus === 409 || errorData?.code === "CONFLICT_RETRY_EXHAUSTED") {
    return t("error_CONFLICT_RETRY_EXHAUSTED");
  }
  if (errorData?.code) {
    const errorKey = `error_${errorData.code}` as keyof typeof nl;
    if (errorKey in nl) {
      return t(errorKey);
    }
  }
  return t("error_GENERIC");
}

export function usePool(gamePoolId: string, initialData?: PoolSnapshot) {
  const queryClient = useQueryClient();

  const queryKey = ["pool", gamePoolId];

  const poolQuery = useQuery<PoolSnapshot>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/pool/${gamePoolId}`);
      if (!res.ok) {
        throw new Error("Failed to load pool");
      }
      const data = (await res.json()) as { pool: PoolSnapshot };
      return data.pool;
    },
    initialData,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const indicateMutation = useMutation({
    mutationFn: async ({
      passId,
      action,
    }: {
      passId: string;
      action: "keep" | "release" | "giveBack";
    }) => {
      const currentPool = queryClient.getQueryData<PoolSnapshot>(queryKey);
      const targetPass = currentPool?.passes.find((p) => p.id === passId);
      const isReclaimAction = action === "keep" && targetPass?.status === "assigned";

      const idempotencyKey = `ind_${passId}_${action}_${Date.now()}`;
      const res = await fetch(`/api/pool/${gamePoolId}/pass/${passId}/indicate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        const message = parseAndTranslateError(res.status, errorData);
        toast.error(message);
        throw new Error(errorData.code || "ERROR");
      }

      const data = (await res.json()) as { pool: PoolSnapshot };
      const hoursBucket = getHoursToKickoffBucket(data.pool.fixture.kickoffAt);

      if (isReclaimAction) {
        trackReclaim({ hoursToKickoffBucket: hoursBucket });
      } else if (action === "keep") {
        trackIndicateKeep({ hoursToKickoffBucket: hoursBucket });
      } else if (action === "release") {
        trackIndicateRelease({ hoursToKickoffBucket: hoursBucket });
      } else if (action === "giveBack") {
        trackGiveBack({ hoursToKickoffBucket: hoursBucket });
      }

      return data.pool;
    },
    onSuccess: (newPool) => {
      queryClient.setQueryData(queryKey, newPool);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const joinQueueMutation = useMutation({
    mutationFn: async ({
      kind,
      guestName,
    }: {
      kind: "self" | "guest";
      guestName?: string | null;
    }) => {
      const currentPool = queryClient.getQueryData<PoolSnapshot>(queryKey);
      const queueLengthBefore =
        currentPool?.queue.filter((q) => q.status === "waiting").length ?? 0;

      const idempotencyKey = `join_${kind}_${Date.now()}`;
      const res = await fetch(`/api/pool/${gamePoolId}/queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ kind, guestName }),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        const message = parseAndTranslateError(res.status, errorData);
        toast.error(message);
        throw new Error(errorData.code || "ERROR");
      }

      const data = (await res.json()) as { pool: PoolSnapshot };
      const hoursBucket = getHoursToKickoffBucket(data.pool.fixture.kickoffAt);

      if (kind === "self") {
        trackQueueJoinSelf({
          queueLengthBefore,
          hoursToKickoffBucket: hoursBucket,
        });
      } else {
        trackQueueJoinGuest({
          queueLengthBefore,
          hoursToKickoffBucket: hoursBucket,
        });
      }

      return data.pool;
    },
    onSuccess: (newPool) => {
      queryClient.setQueryData(queryKey, newPool);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const cancelQueueMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const currentPool = queryClient.getQueryData<PoolSnapshot>(queryKey);
      const waitingEntries =
        currentPool?.queue.filter((q) => q.status === "waiting") ?? [];
      const entryPos =
        waitingEntries.findIndex((q) => q.entryId === entryId) + 1;

      const idempotencyKey = `cancel_q_${entryId}_${Date.now()}`;
      const res = await fetch(`/api/pool/${gamePoolId}/queue/${entryId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        const message = parseAndTranslateError(res.status, errorData);
        toast.error(message);
        throw new Error(errorData.code || "ERROR");
      }

      const data = (await res.json()) as { pool: PoolSnapshot };
      const hoursBucket = getHoursToKickoffBucket(data.pool.fixture.kickoffAt);
      trackQueueCancel({
        queuePosition: entryPos > 0 ? entryPos : undefined,
        hoursToKickoffBucket: hoursBucket,
      });

      return data.pool;
    },
    onSuccess: (newPool) => {
      queryClient.setQueryData(queryKey, newPool);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const transferPassMutation = useMutation({
    mutationFn: async ({
      passId,
      toMemberId,
      fixtureId,
    }: {
      passId: string;
      toMemberId: string;
      fixtureId?: string;
    }) => {
      const idempotencyKey = `poss_${passId}_${toMemberId}_${Date.now()}`;
      const res = await fetch(`/api/pass/${passId}/holder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ toMemberId, fixtureId, kind: "handover" }),
      });

      if (!res.ok) {
        toast.error(t("error_GENERIC"));
        throw new Error("FAILED");
      }

      toast.success(t("holderUpdated"));
      const data = (await res.json()) as { pool?: PoolSnapshot };

      const hoursBucket = data.pool
        ? getHoursToKickoffBucket(data.pool.fixture.kickoffAt)
        : undefined;
      trackHandover({
        isHolderNow: true,
        hoursToKickoffBucket: hoursBucket,
      });

      return data.pool;
    },
    onSuccess: (newPool) => {
      if (newPool) {
        queryClient.setQueryData(queryKey, newPool);
      } else {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    pool: poolQuery.data,
    isLoading: poolQuery.isLoading,
    isRefetching: poolQuery.isRefetching,
    refetch: poolQuery.refetch,
    indicatePass: indicateMutation.mutateAsync,
    isIndicating: indicateMutation.isPending,
    joinQueue: joinQueueMutation.mutateAsync,
    isJoining: joinQueueMutation.isPending,
    cancelQueueEntry: cancelQueueMutation.mutateAsync,
    isCancelling: cancelQueueMutation.isPending,
    transferPass: transferPassMutation.mutateAsync,
    isTransferring: transferPassMutation.isPending,
  };
}
