"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/authClient";
import {
  resetUser,
  trackPasskeyRegistered,
  trackPasskeyDeleted,
  trackSessionsRevoked,
  trackSignOut,
} from "@/lib/posthog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fingerprint, Plus, Trash2, Shield, LogOut, Laptop, CheckCircle2 } from "lucide-react";
import { t } from "@/i18n/t";

interface PasskeyItem {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
}

interface SessionItem {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string | Date;
  expiresAt: string | Date;
}

export function SecuritySettings({ userEmail }: { userEmail?: string }) {
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(false);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const loadData = useCallback(async () => {
    setLoadingPasskeys(true);
    try {
      const [pkRes, sessRes] = await Promise.all([
        authClient.passkey.listUserPasskeys(),
        authClient.listSessions(),
      ]);
      if (pkRes && pkRes.data) {
        setPasskeys(pkRes.data as PasskeyItem[]);
      }
      if (sessRes && sessRes.data) {
        setSessions(sessRes.data as SessionItem[]);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoadingPasskeys(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const [pkRes, sessRes] = await Promise.all([
          authClient.passkey.listUserPasskeys(),
          authClient.listSessions(),
        ]);
        if (!ignore && pkRes?.data) {
          setPasskeys(pkRes.data as PasskeyItem[]);
        }
        if (!ignore && sessRes?.data) {
          setSessions(sessRes.data as SessionItem[]);
        }
      } catch {
        // Non-blocking
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  const handleAddPasskey = async () => {
    setAddingPasskey(true);
    setError(null);
    setMessage(null);

    try {
      const res = await authClient.passkey.addPasskey({
        name: `${navigator.userAgent.includes("iPhone") ? "iPhone" : navigator.userAgent.includes("Android") ? "Android" : "Passkey"} (${new Date().toLocaleDateString("nl-NL")})`,
      });

      if (res && res.error) {
        console.error("[settings:addPasskey] Failed:", res.error);
        setError(t("passkeyAddError"));
      } else {
        trackPasskeyRegistered();
        setMessage(t("passkeyAddSuccess"));
        await loadData();
      }
    } catch (err) {
      console.error("[settings:addPasskey] Exception:", err);
      setError(t("passkeyAddError"));
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    try {
      await authClient.passkey.deletePasskey({ id });
      trackPasskeyDeleted();
      setMessage(t("settingsPasskeyDeleted"));
      await loadData();
    } catch {
      setError(t("passkeyAddError"));
    }
  };

  const handleRevokeOthers = async () => {
    setRevoking(true);
    setError(null);
    setMessage(null);

    try {
      await authClient.revokeOtherSessions();
      trackSessionsRevoked();
      setMessage(t("settingsRevokedSuccess"));
      await loadData();
    } catch {
      setError(t("error_GENERIC"));
    } finally {
      setRevoking(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      trackSignOut();
      resetUser();
      await authClient.signOut();
      router.push("/inloggen");
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className="p-3 text-sm rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3 text-sm rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Passkeys Card */}
      <Card className="dark:bg-[#131B2E] dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <Fingerprint className="h-4 w-4" />
              <span>{t("settingsPasskeysTitle")}</span>
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddPasskey}
              disabled={addingPasskey}
              className="text-xs dark:bg-slate-800 dark:border-slate-700"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {addingPasskey ? t("loginVerifying") : t("settingsAddPasskey")}
            </Button>
          </div>
          <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
            {t("settingsPasskeysDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingPasskeys ? (
            <p className="text-xs text-slate-400">{t("loginVerifying")}</p>
          ) : passkeys.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
              {t("settingsNoPasskeys")}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {passkeys.map((pk) => (
                <div key={pk.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                      <Fingerprint className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {pk.name || "Passkey"}
                      </div>
                      {pk.createdAt && (
                        <div className="text-xs text-slate-400">
                          {t("settingsPasskeyCreated", {
                            date: new Date(pk.createdAt).toLocaleDateString("nl-NL"),
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeletePasskey(pk.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 p-2 h-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessions Card */}
      <Card className="dark:bg-[#131B2E] dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-slate-600 dark:text-slate-300">
              <Shield className="h-4 w-4" />
              <span>{t("settingsSessionsTitle")}</span>
            </CardTitle>
            {sessions.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRevokeOthers}
                disabled={revoking}
                className="text-xs text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                {revoking ? t("settingsRevoking") : t("settingsRevokeOtherSessions")}
              </Button>
            )}
          </div>
          <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
            {userEmail ? t("settingsUserEmail", { email: userEmail }) : t("settingsSessionsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sessions.map((sess, idx) => (
              <div key={sess.id} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {idx === 0 ? t("settingsCurrentSession") : t("settingsOtherSession")}
                    </div>
                    <div className="text-xs text-slate-400">
                      {sess.ipAddress ? `${sess.ipAddress} • ` : ""}
                      {new Date(sess.createdAt).toLocaleDateString("nl-NL")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:border-slate-700 dark:hover:bg-red-950/30"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {signingOut ? t("settingsRevoking") : t("settingsSignOut")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
