"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PoolSnapshot } from "@/server/snapshot";

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
      const idempotencyKey = `ind_${passId}_${action}_${Date.now()}`;
      const res = await fetch(`/api/pool/${gamePoolId}/pass/${passId}/indicate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ action }),
      });

      if (res.status === 409) {
        toast.error("Iemand was je net voor!");
        throw new Error("CONFLICT");
      }
      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(errorData.error || "Er ging iets mis");
        throw new Error(errorData.error || "ERROR");
      }

      const data = (await res.json()) as { pool: PoolSnapshot };
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
      const idempotencyKey = `join_${kind}_${Date.now()}`;
      const res = await fetch(`/api/pool/${gamePoolId}/queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ kind, guestName }),
      });

      if (res.status === 409) {
        toast.error("Iemand was je net voor!");
        throw new Error("CONFLICT");
      }
      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(errorData.error || "Er ging iets mis");
        throw new Error(errorData.error || "ERROR");
      }

      const data = (await res.json()) as { pool: PoolSnapshot };
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
      const idempotencyKey = `cancel_q_${entryId}_${Date.now()}`;
      const res = await fetch(`/api/pool/${gamePoolId}/queue/${entryId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
      });

      if (res.status === 409) {
        toast.error("Iemand was je net voor!");
        throw new Error("CONFLICT");
      }
      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(errorData.error || "Er ging iets mis");
        throw new Error(errorData.error || "ERROR");
      }

      const data = (await res.json()) as { pool: PoolSnapshot };
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
        toast.error("Overdracht mislukt");
        throw new Error("FAILED");
      }

      toast.success("Pas overgedragen!");
      const data = (await res.json()) as { pool?: PoolSnapshot };
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
