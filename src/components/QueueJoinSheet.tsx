"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, User, Check, ArrowUpRight } from "lucide-react";
import { t } from "@/i18n/t";
import type { PoolSnapshot } from "@/server/snapshot";

interface QueueJoinSheetProps {
  unindicatedPass?: PoolSnapshot["passes"][number] | null;
  onIndicate?: (passId: string, action: "keep" | "release") => Promise<void>;
  onJoin: (kind: "self" | "guest", guestName?: string | null) => Promise<void>;
  loading: boolean;
}

export function QueueJoinSheet({
  unindicatedPass,
  onIndicate,
  onJoin,
  loading,
}: QueueJoinSheetProps) {
  const [openGuestDialog, setOpenGuestDialog] = useState(false);
  const [guestName, setGuestName] = useState("");

  const handleJoinSelf = async () => {
    await onJoin("self");
  };

  const handleJoinGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    await onJoin("guest", guestName.trim() || null);
    setGuestName("");
    setOpenGuestDialog(false);
  };

  const handleKeep = async () => {
    if (unindicatedPass && onIndicate) {
      await onIndicate(unindicatedPass.id, "keep");
    }
  };

  const handleRelease = async () => {
    if (unindicatedPass && onIndicate) {
      await onIndicate(unindicatedPass.id, "release");
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 pt-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white/95 dark:bg-[#0B0F19]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-40">
      <div className="max-w-xl mx-auto flex gap-3">
        {unindicatedPass && onIndicate ? (
          <>
            <Button
              variant="club"
              disabled={loading}
              onClick={handleKeep}
              className="flex-1 min-w-0 text-sm font-semibold truncate flex items-center justify-center space-x-2 shadow-sm"
            >
              <Check className="h-4 w-4" />
              <span>{t("actionKeep")}</span>
            </Button>

            <Button
              variant="outline"
              disabled={loading}
              onClick={handleRelease}
              className="flex-1 min-w-0 text-sm font-semibold truncate flex items-center justify-center space-x-2 border-2 border-emerald-600 dark:border-emerald-500 text-emerald-950 dark:text-emerald-100 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-bold"
            >
              <ArrowUpRight className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
              <span>{t("actionRelease")}</span>
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="club"
              disabled={loading}
              onClick={handleJoinSelf}
              className="flex-1 min-w-0 text-sm font-semibold truncate flex items-center justify-center space-x-2 shadow-sm"
            >
              <User className="h-4 w-4" />
              <span>{t("joinForSelf")}</span>
            </Button>

            <Dialog open={openGuestDialog} onOpenChange={setOpenGuestDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={loading}
                  className="flex-1 min-w-0 text-sm font-semibold truncate flex items-center justify-center space-x-2 border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>{t("joinForGuest")}</span>
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
          </>
        )}
      </div>
    </div>
  );
}
