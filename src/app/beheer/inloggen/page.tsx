"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, KeyRound, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n/t";
import { trackAdminLogin } from "@/lib/posthog";

export default function BeheerInloggenPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        if (res.status === 503) {
          setErrorMsg(t("beheerNotConfigured"));
        } else if (res.status === 401) {
          setErrorMsg(t("beheerInvalidPassword"));
        } else {
          setErrorMsg(data?.error || t("error_GENERIC"));
        }
        setLoading(false);
        return;
      }

      trackAdminLogin();
      router.push("/beheer");
      router.refresh();
    } catch {
      setErrorMsg(t("error_GENERIC"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85dvh] flex flex-col justify-center max-w-sm mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href="/instellingen"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("navSettings")}</span>
        </Link>
      </div>

      <Card className="border border-border shadow-sm">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">{t("beheerLoginTitle")}</CardTitle>
          <CardDescription className="text-xs">
            {t("beheerLoginSubtitle")}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4">
          <form onSubmit={handleLogin} className="space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-lg">
                {errorMsg}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {t("beheerPasswordLabel")}
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <KeyRound className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("beheerCheckingPassword") : t("beheerLoginSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
