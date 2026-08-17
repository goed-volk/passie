import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { t } from "@/i18n/t";
import type { PoolSnapshot } from "@/server/snapshot";

export function ActivityTimeline({
  timeline,
}: {
  timeline: PoolSnapshot["timeline"];
}) {
  const [expanded, setExpanded] = useState(false);
  const displayedEvents = expanded ? timeline : timeline.slice(0, 5);

  if (timeline.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("stepTimelineTitle")}
          </h2>
        </div>

        {timeline.length > 5 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-500 dark:text-slate-400 h-8 px-2 hover:text-slate-900 dark:hover:text-slate-100"
          >
            {expanded ? "Minder tonen" : `Alles tonen (${timeline.length})`}
            {expanded ? (
              <ChevronUp className="h-3 w-3 ml-1" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-1" />
            )}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3 divide-y divide-slate-100 dark:divide-slate-800">
          {displayedEvents.map((evt) => {
            const time = new Date(evt.at * 1000).toLocaleTimeString("nl-NL", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Amsterdam",
            });

            return (
              <div key={evt.id} className="pt-2.5 first:pt-0 flex items-start justify-between text-xs space-x-3">
                <span className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                  {evt.text}
                </span>
                <span className="text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">{time}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
