import Link from "next/link";
import { asc, desc, gte, lt } from "drizzle-orm";
import { getDb } from "@/server/db";
import { requireActingMember } from "@/server/actingMember";
import { checkIngestCooldown } from "@/server/ingest";
import * as schema from "@/server/schema";
import { TopNav } from "@/components/TopNav";
import { RefreshFixturesButton } from "@/components/RefreshFixturesButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, MapPin } from "lucide-react";
import { t } from "@/i18n/t";

export const dynamic = "force-dynamic";

function getCurrentUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export default async function WedstrijdenPage() {
  const db = await getDb();
  const actingMember = await requireActingMember(db);
  const now = getCurrentUnixTimestamp();
  const cooldownStatus = checkIngestCooldown(now);

  // Next 5 upcoming fixtures
  const upcomingFixtures = await db.query.fixtures.findMany({
    where: gte(schema.fixtures.kickoffAt, now - 3 * 3600),
    orderBy: [asc(schema.fixtures.kickoffAt)],
    limit: 5,
  });

  // Last 5 past fixtures
  const pastFixtures = await db.query.fixtures.findMany({
    where: lt(schema.fixtures.kickoffAt, now - 3 * 3600),
    orderBy: [desc(schema.fixtures.kickoffAt)],
    limit: 5,
  });

  return (
    <main className="min-h-[100dvh] bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 pb-20">
      <div className="max-w-xl mx-auto px-4 sm:px-6 space-y-6 pt-2">
        <TopNav actingMember={actingMember} />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{t("navFixtures")}</h1>
          </div>

          <RefreshFixturesButton
            initialRemainingSeconds={Math.ceil(cooldownStatus.remainingSeconds)}
          />
        </div>

        {/* Upcoming fixtures */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("upcomingFixtures")}
          </h2>

          {upcomingFixtures.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {t("noUpcomingFixtures")}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {upcomingFixtures.map((fix) => {
                const date = new Date(fix.kickoffAt * 1000).toLocaleDateString(
                  "nl-NL",
                  {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Amsterdam",
                  }
                );

                return (
                  <Card key={fix.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            Excelsior {t("vs")} {fix.opponent}
                          </span>
                          {fix.status === "cancelled" && (
                            <Badge variant="destructive">{t("cancelledBadge")}</Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center space-x-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{date}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{fix.venue}</span>
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Past fixtures */}
        {pastFixtures.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("pastFixtures")}
            </h2>

            <div className="space-y-2">
              {pastFixtures.map((fix) => {
                const date = new Date(fix.kickoffAt * 1000).toLocaleDateString(
                  "nl-NL",
                  {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Europe/Amsterdam",
                  }
                );

                return (
                  <Card key={fix.id} className="opacity-75">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                          Excelsior {t("vs")} {fix.opponent}
                        </span>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{date}</div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
