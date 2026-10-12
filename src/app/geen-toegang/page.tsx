import { getDb } from "@/server/db";
import { getActingSession } from "@/server/actingMember";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { t } from "@/i18n/t";
import { SignOutButton } from "@/components/auth/SignOutButton";

export const dynamic = "force-dynamic";

export default async function GeenToegangPage() {
  const db = await getDb();
  const sessionResult = await getActingSession(db);
  const email = sessionResult.user?.email || "onbekend";

  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 p-4">
      <Card className="w-full max-w-md dark:bg-[#131B2E] dark:border-slate-800 text-center">
        <CardHeader className="flex flex-col items-center space-y-3 pb-2">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <CardTitle className="text-xl font-bold">{t("loginNoAccessTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {t("loginNoAccessDesc", { email })}
          </p>
          <div className="pt-2">
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
