import Link from "next/link";
import { getDb } from "@/server/db";
import { requireActingMember } from "@/server/actingMember";
import { TopNav } from "@/components/TopNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Lock, Palette, ShieldAlert, User } from "lucide-react";
import { t } from "@/i18n/t";
import { SecuritySettings } from "@/components/auth/SecuritySettings";

export const dynamic = "force-dynamic";

export default async function InstellingenPage() {
  const db = await getDb();
  const actingMember = await requireActingMember(db);

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
          <h1 className="text-2xl font-bold tracking-tight">{t("navSettings")}</h1>
        </div>

        {/* Club Theme Selector */}
        <Card className="dark:bg-[#131B2E] dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <Palette className="h-4 w-4" />
              <span>{t("themeTitle")}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ThemeToggle variant="card" />
          </CardContent>
        </Card>

        {/* Acting Member */}
        <Card className="dark:bg-[#131B2E] dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <User className="h-4 w-4" />
              <span>{t("currentProfile")}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {actingMember.displayName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {actingMember.email || t("selectedParticipant")}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Auth & Security (Passkeys, Sessions, Sign Out) */}
        <SecuritySettings userEmail={actingMember.email} />

        {/* Privacy & Info */}
        <Card className="dark:bg-[#131B2E] dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <ShieldAlert className="h-4 w-4" />
              <span>{t("privacyTitle")}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <p>{t("privacyText")}</p>
          </CardContent>
        </Card>

        {/* Beheer / Admin (only if group admin or platform admin) */}
        <Card className="dark:bg-[#131B2E] dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <Lock className="h-4 w-4" />
              <span>{t("beheerCardTitle")}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t("beheerCardDesc")}
            </p>
            <Link href="/beheer">
              <Button size="sm" variant="outline" className="text-xs dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                {t("toBeheer")}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Version info */}
        <Card className="dark:bg-[#131B2E] dark:border-slate-800">
          <CardContent className="p-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Passie ({process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || "dev"})</span>
            <a
              href="https://github.com/jvanu/passie"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 hover:text-slate-900 dark:hover:text-white"
            >
              <span>{t("sourceCode")}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
