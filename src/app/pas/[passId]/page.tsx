import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { requireActingMember } from "@/server/actingMember";
import * as schema from "@/server/schema";
import { TopNav } from "@/components/TopNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, ArrowRight, ShieldCheck, History } from "lucide-react";
import { t } from "@/i18n/t";
import { PassHolderControl } from "@/components/PassHolderControl";

export const dynamic = "force-dynamic";

export default async function PassPage(props: {
  params: Promise<{ passId: string }>;
}) {
  const { passId } = await props.params;
  const db = await getDb();
  const actingMember = await requireActingMember(db);

  // 1. Fetch pass
  const pass = await db.query.passes.findFirst({
    where: eq(schema.passes.id, passId),
  });

  if (!pass) {
    notFound();
  }

  // 2. Fetch all members in group
  const membersList = await db.query.members.findMany({
    where: eq(schema.members.groupId, pass.groupId),
  });
  const membersMap = new Map(membersList.map((m) => [m.id, m]));

  // 3. Fetch pass owners
  const ownersList = await db.query.passOwners.findMany({
    where: eq(schema.passOwners.passId, pass.id),
  });
  const owners = ownersList
    .map((o) => membersMap.get(o.memberId))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  // Current holder
  const currentHolder = pass.holderMemberId
    ? membersMap.get(pass.holderMemberId) ?? null
    : null;

  // 4. Fetch possession history for this pass
  const possessionEvents = await db.query.possessionEvents.findMany({
    where: eq(schema.possessionEvents.passId, pass.id),
    orderBy: [desc(schema.possessionEvents.createdAt)],
  });

  const memberRefs = membersList.map((m) => ({
    id: m.id,
    groupId: m.groupId,
    displayName: m.displayName,
    initials: m.initials,
    avatarColor: m.avatarColor,
    slug: m.slug,
  }));

  const ownersDisplayName = owners.map((o) => o.displayName).join(" & ");

  return (
    <main className="min-h-[100dvh] bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 pb-20">
      <div className="max-w-xl mx-auto px-4 sm:px-6 space-y-6 pt-2">
        <TopNav actingMember={actingMember} />

        <div className="flex items-center space-x-3">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {pass.label}
            </h1>
            {pass.seatInfo && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{pass.seatInfo}</p>
            )}
          </div>
        </div>

        {/* Owners Card */}
        <Card className="dark:bg-[#131B2E] dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <ShieldCheck className="h-4 w-4" />
              <span>{t("coOwners")}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {owners.map((owner) => (
                <div
                  key={owner.id}
                  className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-1.5"
                >
                  <Avatar
                    className="h-6 w-6"
                    style={{ backgroundColor: owner.avatarColor }}
                  >
                    <AvatarFallback style={{ backgroundColor: owner.avatarColor }}>
                      {owner.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {owner.displayName}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Current Holder & Transfer Control */}
        <PassHolderControl
          passId={pass.id}
          currentHolder={currentHolder}
          allMembers={memberRefs}
        />

        {/* Possession History */}
        <section className="space-y-3">
          <div className="flex items-center space-x-2">
            <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Geschiedenis overdrachten
            </h2>
          </div>

          <Card className="dark:bg-[#131B2E] dark:border-slate-800">
            <CardContent className="p-4 space-y-3 divide-y divide-slate-100 dark:divide-slate-800">
              {possessionEvents.length === 0 ? (
                <div className="text-center text-xs text-slate-400 dark:text-slate-500 py-3">
                  Nog geen overdrachten geregistreerd voor deze pas.
                </div>
              ) : (
                possessionEvents.map((evt) => {
                  const fromMember = evt.fromMemberId
                    ? membersMap.get(evt.fromMemberId)
                    : null;
                  const toMember = membersMap.get(evt.toMemberId);
                  const date = new Date(evt.createdAt * 1000).toLocaleDateString(
                    "nl-NL",
                    {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Amsterdam",
                    }
                  );

                  return (
                    <div
                      key={evt.id}
                      className="pt-2.5 first:pt-0 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-600 dark:text-slate-400">
                          {fromMember ? fromMember.displayName : "Niemand"}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {toMember ? toMember.displayName : "Onbekend"}
                        </span>
                      </div>
                      <span className="text-slate-400 dark:text-slate-500 tabular-nums">{date}</span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
