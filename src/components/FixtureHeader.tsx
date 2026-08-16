import { t } from "@/i18n/t";
import type { PoolSnapshot } from "@/server/snapshot";
import { Badge } from "@/components/ui/badge";

export function FixtureHeader({ pool }: { pool: PoolSnapshot }) {
  const kickoffDate = new Date(pool.fixture.kickoffAt * 1000);
  const formattedDate = kickoffDate.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });

  const isCancelled = pool.fixture.status === "cancelled" || pool.status === "cancelled";

  return (
    <header className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden">
      <div
        className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20"
        style={{ backgroundColor: pool.club.colorPrimary }}
      />

      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {pool.fixture.competition}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-xs font-semibold text-slate-300">
            {t("home")}
          </span>
        </div>

        {isCancelled ? (
          <Badge variant="destructive">{t("poolCancelled")}</Badge>
        ) : pool.deadline.passed ? (
          <Badge variant="warning">{t("deadlinePassed")}</Badge>
        ) : (
          <Badge variant="secondary" className="bg-slate-800 text-slate-200 border-slate-700">
            {t("deadlineLabel")}{" "}
            {new Date(pool.deadline.at * 1000).toLocaleTimeString("nl-NL", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Amsterdam",
            })}
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {pool.club.shortName} {t("vs")} {pool.fixture.opponent}
        </h1>
        <div className="text-sm font-medium text-slate-300 flex items-center space-x-2">
          <span>{formattedDate}</span>
          <span>·</span>
          <span>{pool.fixture.venue}</span>
        </div>
      </div>
    </header>
  );
}
