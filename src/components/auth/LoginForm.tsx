"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/authClient";
import {
  identifyUser,
  trackSignInOtpRequested,
  trackSignInSuccess,
  trackPasskeyRegistered,
} from "@/lib/posthog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KeyRound, Mail, ArrowRight, Fingerprint, RefreshCw } from "lucide-react";
import { t } from "@/i18n/t";

type LoginStep = "email" | "otp" | "prompt-passkey";

export function LoginForm() {
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const router = useRouter();
  const mountedRef = useRef(false);

  const syncAfterLogin = useCallback(async () => {
    try {
      const meRes = await fetch("/api/me");
      if (meRes.ok) {
        const data = (await meRes.json()) as { member?: { id: string } };
        if (data.member) {
          identifyUser(data.member.id);
        }
      }
    } catch {
      // Non-critical telemetry sync
    }
    router.push("/");
    router.refresh();
  }, [router]);

  // Conditional UI passkey autofill on mount
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      authClient.signIn
        .passkey({ autoFill: true })
        .then(async (res) => {
          if (res && !res.error) {
            await syncAfterLogin();
          }
        })
        .catch(() => {
          // Conditional mediation abort/cancel is normal
        });
    }
  }, [syncAfterLogin]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !email.includes("@")) return;

    setLoading(true);
    setError(null);

    try {
      const res = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: "sign-in",
      });

      if (res.error) {
        if (res.error.status === 429) {
          setError(t("loginRateLimited"));
        } else {
          setError(res.error.message || t("loginFailedGeneric"));
        }
      } else {
        trackSignInOtpRequested();
        setStep("otp");
      }
    } catch {
      setError(t("loginFailedGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanOtp = otp.trim();
    if (cleanOtp.length < 6) return;

    setLoading(true);
    setError(null);

    try {
      const res = await authClient.signIn.emailOtp({
        email: email.trim().toLowerCase(),
        otp: cleanOtp,
      });

      if (res.error) {
        if (res.error.status === 429) {
          setError(t("loginRateLimited"));
        } else {
          setError(t("loginInvalidOtp"));
        }
      } else {
        trackSignInSuccess({ method: "otp" });
        // Successfully verified OTP. Check if device supports WebAuthn passkeys
        if (typeof window !== "undefined" && window.PublicKeyCredential) {
          setStep("prompt-passkey");
        } else {
          await syncAfterLogin();
        }
      }
    } catch {
      setError(t("loginInvalidOtp"));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setPasskeyLoading(true);
    setError(null);

    try {
      const res = await authClient.signIn.passkey();
      if (res && res.error) {
        console.error("[passkey:signIn] Failed:", res.error);
        setError(t("passkeyAuthError"));
      } else {
        trackSignInSuccess({ method: "passkey" });
        await syncAfterLogin();
      }
    } catch (err) {
      console.error("[passkey:signIn] Exception:", err);
      setError(t("passkeyAuthError"));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setPasskeyLoading(true);
    setError(null);

    try {
      const res = await authClient.passkey.addPasskey({
        name: `${navigator.userAgent.includes("iPhone") ? "iPhone" : navigator.userAgent.includes("Android") ? "Android" : "Passkey"} (${new Date().toLocaleDateString("nl-NL")})`,
      });

      if (res && res.error) {
        console.error("[passkey:addPasskey] Failed:", res.error);
        setError(t("passkeyAddError"));
      } else {
        trackPasskeyRegistered();
        await syncAfterLogin();
      }
    } catch (err) {
      console.error("[passkey:addPasskey] Exception:", err);
      setError(t("passkeyAddError"));
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md dark:bg-[#131B2E] dark:border-slate-800 shadow-xl">
      <CardHeader className="text-center space-y-1 pb-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mb-2">
          {step === "prompt-passkey" ? (
            <Fingerprint className="w-6 h-6" />
          ) : step === "otp" ? (
            <KeyRound className="w-6 h-6" />
          ) : (
            <Mail className="w-6 h-6" />
          )}
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          {step === "prompt-passkey"
            ? t("loginPromptPasskeyAfterOtpTitle")
            : step === "otp"
              ? t("loginCodeSentTitle")
              : t("loginTitle")}
        </CardTitle>
        <CardDescription className="text-sm text-slate-500 dark:text-slate-400">
          {step === "prompt-passkey"
            ? t("loginPromptPasskeyAfterOtpDesc")
            : step === "otp"
              ? t("loginCodeSentDesc", { email })
              : t("loginSubtitle")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 text-sm rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {step === "email" && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                {t("loginEmailLabel")}
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="username webauthn"
                placeholder={t("loginEmailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-red-500 text-base"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-xl shadow-sm"
            >
              {loading ? t("loginSendingCode") : t("loginSendCode")}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-[#131B2E] px-2 text-slate-400">
                  {t("loginPasskeyPrompt")}
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handlePasskeySignIn}
              disabled={passkeyLoading}
              className="w-full border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Fingerprint className="w-4 h-4 mr-2 text-slate-600 dark:text-slate-300" />
              {t("loginWithPasskey")}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="otp" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                {t("loginCodeLabel")}
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="w-full text-center font-mono tracking-widest text-2xl py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-red-500"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-xl"
            >
              {loading ? t("loginVerifying") : t("loginVerifyCode")}
            </Button>

            <div className="flex items-center justify-between pt-2 text-xs">
              <button
                type="button"
                onClick={() => handleSendOtp()}
                disabled={loading}
                className="text-red-600 dark:text-red-400 hover:underline flex items-center"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {t("loginResendCode")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                  setError(null);
                }}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                {t("loginUseDifferentEmail")}
              </button>
            </div>
          </form>
        )}

        {step === "prompt-passkey" && (
          <div className="space-y-3">
            <Button
              onClick={handleRegisterPasskey}
              disabled={passkeyLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-xl"
            >
              <Fingerprint className="w-4 h-4 mr-2" />
              {passkeyLoading ? t("loginVerifying") : t("loginAddPasskeyNow")}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={syncAfterLogin}
              className="w-full text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              {t("loginSkipPasskey")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
