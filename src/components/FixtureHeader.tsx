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
    <header
      className="text-white rounded-3xl p-5 sm:p-6 shadow-lg relative overflow-hidden border border-slate-800/80"
      style={{
        background: `radial-gradient(ellipse 85% 85% at 90% -10%, ${pool.club.colorPrimary}55 0%, transparent 65%), linear-gradient(145deg, #0F172A 0%, #090D16 100%)`,
      }}
    >
      <div
        className="absolute -top-12 -right-12 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-45 mix-blend-screen"
        style={{ backgroundColor: pool.club.colorPrimary }}
      />
      <div
        className="absolute -bottom-16 -left-16 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-25 mix-blend-screen"
        style={{ backgroundColor: pool.club.colorPrimary }}
      />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {pool.fixture.competition}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-xs font-semibold text-slate-200">
              {t("home")}
            </span>
          </div>

          {isCancelled ? (
            <Badge variant="destructive">{t("poolCancelled")}</Badge>
          ) : pool.deadline.passed ? (
            <Badge variant="warning">{t("deadlinePassed")}</Badge>
          ) : (
            <Badge variant="secondary" className="bg-slate-800/90 text-slate-100 border-slate-700/80 backdrop-blur-xs">
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
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight drop-shadow-xs">
            {pool.club.shortName} {t("vs")} {pool.fixture.opponent}
          </h1>
          <div className="text-sm font-medium text-slate-200/90 flex items-center space-x-2">
            <span>{formattedDate}</span>
            <span className="text-slate-400">·</span>
            <span>{pool.fixture.venue}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
