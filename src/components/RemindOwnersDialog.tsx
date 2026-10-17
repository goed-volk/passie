"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Mail, AlertCircle, Loader2 } from "lucide-react";
import { t } from "@/i18n/t";
import { trackAdminDeadlineReminded } from "@/lib/posthog";
import type { MemberRef, PoolSnapshot } from "@/server/snapshot";

export interface RemindOwnersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gamePoolId: string;
  matchLabel: string;
  unindicatedPasses: PoolSnapshot["passes"];
}

interface OwnerGroup {
  member: MemberRef;
  passLabels: string[];
}

export function RemindOwnersDialog({
  open,
  onOpenChange,
  gamePoolId,
  matchLabel,
  unindicatedPasses,
}: RemindOwnersDialogProps) {
  const [sending, setSending] = useState(false);

  // Group unindicated passes by unique owner
  const recipientMap = new Map<string, OwnerGroup>();
  const skippedMap = new Map<string, OwnerGroup>();

  for (const pass of unindicatedPasses) {
    for (const owner of pass.owners) {
      const targetMap = owner.hasEmail ? recipientMap : skippedMap;
      let group = targetMap.get(owner.id);
      if (!group) {
        group = { member: owner, passLabels: [] };
        targetMap.set(owner.id, group);
      }
      if (!group.passLabels.includes(pass.label)) {
        group.passLabels.push(pass.label);
      }
    }
  }

  const recipients = Array.from(recipientMap.values());
  const skipped = Array.from(skippedMap.values());

  const handleSend = async () => {
    if (recipients.length === 0) return;
    setSending(true);

    try {
      const res = await fetch(`/api/pool/${gamePoolId}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sentCount?: number;
        skippedCount?: number;
      };

      if (!res.ok || !data.ok) {
        toast.error(t("remindErrorToast"));
        return;
      }

      trackAdminDeadlineReminded({
        recipientCount: data.sentCount ?? 0,
        skippedCount: data.skippedCount ?? 0,
        unindicatedPassCount: unindicatedPasses.length,
      });

      toast.success(t("remindSuccessToast", { count: data.sentCount ?? 0 }));
      onOpenChange(false);
    } catch {
      toast.error(t("remindErrorToast"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] flex flex-col p-6">
        <DialogHeader className="space-y-1.5 pb-2">
          <DialogTitle className="text-lg font-bold flex items-center space-x-2">
            <Mail className="h-5 w-5 text-[var(--club-primary)]" />
            <span>{t("remindDialogTitle")}</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
            {t("remindDialogDesc", { match: matchLabel })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {/* Recipients List */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              {t("remindRecipientsHeading", { count: recipients.length })}
            </h4>
            {recipients.length > 0 ? (
              <div className="space-y-2">
                {recipients.map(({ member, passLabels }) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <Avatar
                        className="h-8 w-8 shrink-0 text-white font-semibold text-xs"
                        style={{ backgroundColor: member.avatarColor }}
                      >
                        <AvatarFallback style={{ backgroundColor: member.avatarColor }}>
                          {member.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {member.displayName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {passLabels.join(", ")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                {t("remindNoRecipientsWithEmail")}
              </p>
            )}
          </div>

          {/* Skipped Owners (No linked email) */}
          {skipped.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 flex items-center space-x-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{t("remindSkippedNoEmail", { count: skipped.length })}</span>
              </h4>
              <div className="space-y-1.5">
                {skipped.map(({ member, passLabels }) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-100/60 dark:bg-[#0B0F19]/40 text-slate-500 dark:text-slate-400 text-xs"
                  >
                    <span className="font-medium truncate">{member.displayName}</span>
                    <span className="shrink-0 text-[11px] opacity-75">{passLabels.join(", ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
            className="rounded-xl"
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={sending || recipients.length === 0}
            className="rounded-xl bg-[var(--club-primary)] text-white hover:opacity-90 font-semibold"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                <span>{t("remindSendingButton")}</span>
              </>
            ) : (
              t("remindSendButton", { count: recipients.length })
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
