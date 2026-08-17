"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/i18n/t";

interface RefreshFixturesButtonProps {
  initialRemainingSeconds?: number;
}

export function RefreshFixturesButton({
  initialRemainingSeconds = 0,
}: RefreshFixturesButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(
    initialRemainingSeconds
  );

  // Check cooldown status on mount
  useEffect(() => {
    let isMounted = true;
    async function checkStatus() {
      try {
        const res = await fetch("/api/fixtures/refresh");
        if (res.ok) {
          const data = (await res.json()) as { remainingSeconds?: number };
          if (isMounted && typeof data.remainingSeconds === "number") {
            setRemainingSeconds(Math.ceil(data.remainingSeconds));
          }
        }
      } catch {
        // Ignore background probe failure
      }
    }
    checkStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  // Countdown timer when cooldown is active
  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds]);

  const handleRefresh = async () => {
    if (isLoading || remainingSeconds > 0) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/fixtures/refresh", {
        method: "POST",
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        remainingSeconds?: number;
        cooldownSeconds?: number;
      };

      if (response.status === 429) {
        const remaining = Math.ceil(data.remainingSeconds || 60);
        setRemainingSeconds(remaining);
        toast.info(t("refreshCooldown", { seconds: remaining }));
        return;
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Synchronisatie mislukt");
      }

      const cooldown = Math.ceil(data.cooldownSeconds || 300);
      setRemainingSeconds(cooldown);
      toast.success(t("refreshSuccess"));
      router.refresh();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("refreshError")
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isCooldown = remainingSeconds > 0;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={isLoading || isCooldown}
      className="h-8 px-2.5 text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 mr-1.5 text-slate-500 dark:text-slate-400 ${
          isLoading ? "animate-spin text-slate-800 dark:text-slate-200" : ""
        }`}
      />
      <span>
        {isLoading
          ? t("refreshingFixtures")
          : isCooldown
          ? t("refreshCooldown", { seconds: remainingSeconds })
          : t("refreshFixtures")}
      </span>
    </Button>
  );
}
