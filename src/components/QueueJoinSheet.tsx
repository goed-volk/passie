"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, User, Check, ArrowUpRight, ListFilter, Loader2 } from "lucide-react";
import { t } from "@/i18n/t";
import type { PoolSnapshot } from "@/server/snapshot";

interface QueueJoinSheetProps {
  unindicatedPasses?: PoolSnapshot["passes"];
  onIndicate?: (passId: string, action: "keep" | "release") => Promise<void>;
  onJoin: (kind: "self" | "guest", guestName?: string | null) => Promise<void>;
  loading: boolean;
}

export function QueueJoinSheet({
  onJoin,
  onIndicate,
  unindicatedPasses,
  loading,
}: QueueJoinSheetProps) {
  const [openGuestDialog, setOpenGuestDialog] = useState(false);
  const [openReleaseDialog, setOpenReleaseDialog] = useState(false);
  const [isKeepingLocal, setIsKeepingLocal] = useState(false);
  const [isReleasingLocal, setIsReleasingLocal] = useState(false);
  const [isJoiningSelfLocal, setIsJoiningSelfLocal] = useState(false);
  const [isJoiningGuestLocal, setIsJoiningGuestLocal] = useState(false);
  const [guestName, setGuestName] = useState("");

  const activeUnindicated = unindicatedPasses ?? [];
  const singleUnindicated = activeUnindicated.length === 1 ? activeUnindicated[0] : null;
  const multipleUnindicated = activeUnindicated.length > 1;

  const isSingleCoOwned = singleUnindicated ? singleUnindicated.owners.length > 1 : false;
  const singleOwnersDisplayName = singleUnindicated
    ? singleUnindicated.owners.map((o) => o.displayName).join(" & ")
    : "";

  const handleJoinSelf = async () => {
    setIsJoiningSelfLocal(true);
    try {
      await onJoin("self");
    } catch {
      // Handled in mutation
    } finally {
      setIsJoiningSelfLocal(false);
    }
  };

  const handleJoinGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsJoiningGuestLocal(true);
    try {
      await onJoin("guest", guestName.trim() || null);
      setGuestName("");
      setOpenGuestDialog(false);
    } catch {
      // Handled in mutation
    } finally {
      setIsJoiningGuestLocal(false);
    }
  };

  const handleKeep = async () => {
    if (singleUnindicated && onIndicate) {
      setIsKeepingLocal(true);
      try {
        await onIndicate(singleUnindicated.id, "keep");
      } catch {
        // Handled in mutation
      } finally {
        setIsKeepingLocal(false);
      }
    }
  };

  const handleConfirmRelease = async () => {
    if (singleUnindicated && onIndicate) {
      setIsReleasingLocal(true);
      try {
        await onIndicate(singleUnindicated.id, "release");
        setOpenReleaseDialog(false);
      } finally {
        setIsReleasingLocal(false);
      }
    }
  };

  const handleScrollToPassList = () => {
    document.getElementById("pass-list")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 pt-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white/95 dark:bg-[#0B0F19]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-40">
      <div className="max-w-xl mx-auto">
        {multipleUnindicated ? (
          <div className="space-y-1.5">
            <div className="text-center px-2">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                {t("choosePassToIndicate", { count: activeUnindicated.length })}
              </p>
            </div>
            <Button
              variant="club"
              disabled={loading}
              onClick={handleScrollToPassList}
              className="w-full flex items-center justify-center space-x-2 shadow-sm font-semibold py-2.5 min-w-0"
            >
              <ListFilter className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {activeUnindicated.map((p) => p.label).join(", ")}
              </span>
            </Button>
          </div>
        ) : singleUnindicated && onIndicate ? (
          <div className="space-y-1.5">
            <div className="text-center px-2">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                {t("passIndicateFor", { label: singleUnindicated.label })}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="club"
                disabled={loading || isKeepingLocal}
                onClick={handleKeep}
                className="flex-1 min-w-0 text-sm font-bold flex items-center justify-center space-x-2 shadow-sm"
              >
                {isKeepingLocal ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">{t("actionKeep")}</span>
              </Button>

              <Dialog open={openReleaseDialog} onOpenChange={setOpenReleaseDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={loading || isReleasingLocal}
                    className="flex-1 min-w-0 text-sm font-bold flex items-center justify-center space-x-2 border-2 border-emerald-600 dark:border-emerald-500 text-emerald-950 dark:text-emerald-100 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                  >
                    {isReleasingLocal ? (
                      <Loader2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300 animate-spin" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
                    )}
                    <span className="truncate">{t("actionRelease")}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md dark:bg-[#131B2E] dark:border-slate-800">
                  <DialogHeader>
                    <DialogTitle className="dark:text-slate-100">
                      {isSingleCoOwned
                        ? t("releaseCoOwnedConfirmTitle", { owners: singleOwnersDisplayName })
                        : t("releaseConfirmTitle", { label: singleUnindicated.label })}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-600 dark:text-slate-400 pt-1">
                      {isSingleCoOwned
                        ? t("releaseCoOwnedConfirmDesc", { owners: singleOwnersDisplayName })
                        : t("releaseConfirmDesc", { label: singleUnindicated.label })}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-end space-x-2 pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={loading || isReleasingLocal}
                      onClick={() => setOpenReleaseDialog(false)}
                      className="dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {t("cancel")}
                    </Button>
                    <Button
                      type="button"
                      disabled={loading || isReleasingLocal}
                      onClick={handleConfirmRelease}
                      className="border-2 border-emerald-600 dark:border-emerald-500 text-emerald-950 dark:text-emerald-100 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-bold"
                    >
                      {t("releaseConfirmSubmit")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="club"
              disabled={loading || isJoiningSelfLocal}
              onClick={handleJoinSelf}
              className="flex-1 min-w-0 text-sm font-semibold flex items-center justify-center space-x-2 shadow-sm"
            >
              {isJoiningSelfLocal ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <User className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{t("joinForSelf")}</span>
            </Button>

            <Dialog open={openGuestDialog} onOpenChange={setOpenGuestDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={loading || isJoiningGuestLocal}
                  className="flex-1 min-w-0 text-sm font-semibold flex items-center justify-center space-x-2 border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {isJoiningGuestLocal ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">{t("joinForGuest")}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="dark:bg-[#131B2E] dark:border-slate-800">
                <DialogHeader>
                  <DialogTitle className="dark:text-slate-100">{t("joinForGuest")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleJoinGuest} className="space-y-4 pt-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
                      {t("guestNamePrompt")}
                    </label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Bijv. Kees"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--club-primary)]"
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setOpenGuestDialog(false)}
                      className="dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {t("cancel")}
                    </Button>
                    <Button type="submit" variant="club" disabled={loading}>
                      {t("joinSubmit")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );
}
