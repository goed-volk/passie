import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { t } from "@/i18n/t";
import type { PoolSnapshot } from "@/server/snapshot";

interface TransferTasksProps {
  transfers: PoolSnapshot["transfers"];
  fixtureId: string;
  onTransfer: (passId: string, toMemberId: string, fixtureId?: string) => Promise<void>;
  loading: boolean;
}

export function TransferTasks({
  transfers,
  fixtureId,
  onTransfer,
  loading,
}: TransferTasksProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t("step3Title")}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("step3Subtitle")}</p>
      </div>

      {transfers.length === 0 ? (
        <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/40">
          <CardContent className="p-5 text-center flex flex-col items-center justify-center space-y-1">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 mb-1" />
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {t("noTransfersNeeded")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {transfers.map((task) => (
            <Card
              key={task.passId}
              className={`${
                task.involvesMe ? "border-[var(--club-primary)] ring-1 ring-[var(--club-primary)]/50" : ""
              }`}
            >
              <CardContent className="p-3.5 sm:p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {task.passLabel}
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>{task.from ? task.from.displayName : "Niemand"}</span>
                    <ArrowRight className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {task.to.displayName}
                    </span>
                  </div>
                </div>

                {task.involvesMe && (
                  <Button
                    size="sm"
                    variant="club"
                    disabled={loading}
                    className="min-w-0"
                    onClick={() => onTransfer(task.passId, task.to.id, fixtureId)}
                  >
                    <span className="truncate">{t("markTransferred")}</span>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
