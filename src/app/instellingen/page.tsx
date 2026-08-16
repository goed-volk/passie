import Link from "next/link";
import { getDb } from "@/server/db";
import { getActingMember } from "@/server/actingMember";
import { TopNav } from "@/components/TopNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, ShieldAlert, User } from "lucide-react";
import { t } from "@/i18n/t";

export const dynamic = "force-dynamic";

export default async function InstellingenPage() {
  const db = await getDb();
  const actingMember = await getActingMember(db);

  return (
    <main className="min-h-[100dvh] bg-slate-50 text-slate-900 pb-20">
      <div className="max-w-xl mx-auto px-4 sm:px-6 space-y-6 pt-2">
        <TopNav actingMember={actingMember} />

        <div className="flex items-center space-x-3">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{t("navSettings")}</h1>
        </div>

        {/* Acting Member */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-slate-600">
              <User className="h-4 w-4" />
              <span>Huidig profiel</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {actingMember ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Avatar
                    className="h-10 w-10"
                    style={{ backgroundColor: actingMember.avatarColor }}
                  >
                    <AvatarFallback style={{ backgroundColor: actingMember.avatarColor }}>
                      {actingMember.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-bold text-sm text-slate-900">
                      {actingMember.displayName}
                    </div>
                    <div className="text-xs text-slate-500">
                      Geselecteerde deelnemer
                    </div>
                  </div>
                </div>

                <Link href="/wie-ben-jij">
                  <Button size="sm" variant="outline" className="text-xs">
                    {t("switchMember")}
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Geen profiel gekozen</span>
                <Link href="/wie-ben-jij">
                  <Button size="sm" variant="default" className="text-xs">
                    Kies profiel
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Privacy & Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-slate-600">
              <ShieldAlert className="h-4 w-4" />
              <span>{t("privacyTitle")}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-600 leading-relaxed">
            <p>{t("privacyText")}</p>
            <p>
              Omdat de app draait binnen een besloten vriendengroep, zijn er
              geen wachtwoorden vereist. Veranderingen en pasoverdrachten worden
              duidelijk gelogd in de tijdlijn.
            </p>
          </CardContent>
        </Card>

        {/* Version info */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between text-xs text-slate-500">
            <span>Passie MVP v0.1.0</span>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 hover:text-slate-900"
            >
              <span>Broncode</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
