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
          <History className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            {t("stepTimelineTitle")}
          </h2>
        </div>

        {timeline.length > 5 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-500 h-8 px-2"
          >
            <span>{expanded ? "Minder tonen" : `Alles tonen (${timeline.length})`}</span>
            {expanded ? (
              <ChevronUp className="h-3 w-3 ml-1" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-1" />
            )}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3 divide-y divide-slate-100">
          {displayedEvents.map((evt) => {
            const time = new Date(evt.at * 1000).toLocaleTimeString("nl-NL", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Amsterdam",
            });

            return (
              <div key={evt.id} className="pt-2.5 first:pt-0 flex items-start justify-between text-xs space-x-3">
                <span className="text-slate-800 font-medium leading-relaxed">
                  {evt.text}
                </span>
                <span className="text-slate-400 shrink-0 tabular-nums">
                  {time}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
