import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/i18n/t";
import type { PoolSnapshot } from "@/server/snapshot";

interface QueueListProps {
  queue: PoolSnapshot["queue"];
  onCancelEntry: (entryId: number) => Promise<void>;
  loading: boolean;
}

export function QueueList({ queue, onCancelEntry, loading }: QueueListProps) {
  const activeEntries = queue.filter((q) => q.status !== "cancelled");

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t("step2Title")}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("step2Subtitle")}</p>
      </div>

      {activeEntries.length === 0 ? (
        <Card className="border-dashed bg-slate-50/50 dark:bg-slate-900/30">
          <CardContent className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            De wachtrij is momenteel leeg.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activeEntries.map((entry) => (
            <Card
              key={entry.entryId}
              className={`transition-all ${
                entry.isMine ? "border-slate-400 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-800/40" : ""
              }`}
            >
              <CardContent className="p-3.5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="font-bold text-sm text-slate-400 dark:text-slate-500 w-5 text-center">
                    {entry.status === "waiting" ? `#${entry.position}` : "✓"}
                  </div>

                  <Avatar
                    className="h-8 w-8"
                    style={{ backgroundColor: entry.member.avatarColor }}
                  >
                    <AvatarFallback style={{ backgroundColor: entry.member.avatarColor }}>
                      {entry.member.initials}
                    </AvatarFallback>
                  </Avatar>

                  <div>
                    <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                      <span>{entry.member.displayName}</span>
                      {entry.kind === "guest" && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                          {entry.guestName ? `gast: ${entry.guestName}` : t("guestLabel")}
                        </Badge>
                      )}
                    </div>

                    {entry.status === "assigned" && entry.assignedPassLabel && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                        {t("statusAssigned")}: {entry.assignedPassLabel}
                      </span>
                    )}
                  </div>
                </div>

                {entry.canCancel && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={loading}
                    onClick={() => onCancelEntry(entry.entryId)}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    {t("leaveQueue")}
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
