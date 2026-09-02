"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n/t";
import { deriveInitials, deriveSlugBase } from "@/lib/memberNames";
import { trackAdminMemberCreated, trackAdminMemberUpdated } from "@/lib/posthog";
import type { AdminMemberListItem } from "@/server/adminMembers";

interface AdminMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: AdminMemberListItem | null;
}

export function AdminMemberDialog({
  open,
  onOpenChange,
  member,
}: AdminMemberDialogProps) {
  if (!open) {
    return null;
  }
  return (
    <AdminMemberDialogForm
      open={open}
      onOpenChange={onOpenChange}
      member={member}
    />
  );
}

function AdminMemberDialogForm({
  open,
  onOpenChange,
  member,
}: AdminMemberDialogProps) {
  const router = useRouter();
  const isEditing = Boolean(member);

  const [displayName, setDisplayName] = useState(member?.displayName ?? "");
  const [initials, setInitials] = useState(member?.initials ?? "");
  const [isActive, setIsActive] = useState<number>(member?.isActive ?? 1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Derived initials and slug live preview
  const liveInitials = initials.trim() || deriveInitials(displayName || "L");
  const liveSlugPreview = member ? member.slug : deriveSlugBase(displayName);
  const avatarColor = member?.avatarColor ?? "#4F46E5";

  // Deactivation blockers
  const isOwner = member && member.ownedPassLabels.length > 0;
  const holdsPass = member && member.holdsPassLabels.length > 0;

  let deactivationBlockReason: string | null = null;
  if (isOwner) {
    deactivationBlockReason = t("beheerBlockedOwner");
  } else if (holdsPass) {
    deactivationBlockReason = t("beheerBlockedHolder", { pass: member.holdsPassLabels.join(", ") });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg(t("beheerInvalidName"));
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    try {
      if (isEditing && member) {
        const res = await fetch(`/api/admin/members/${member.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: displayName.trim(),
            initials: initials.trim() || undefined,
            isActive,
          }),
        });

        const data = (await res.json().catch(() => null)) as {
          error?: string;
          reason?: string;
          details?: string;
        } | null;
        if (!res.ok) {
          if (res.status === 409 && data?.reason) {
            if (data.reason === "holds_pass") {
              setErrorMsg(t("beheerBlockedHolder", { pass: data.details || "een pas" }));
            } else if (data.reason === "is_owner") {
              setErrorMsg(t("beheerBlockedOwner"));
            } else if (data.reason === "in_open_queue") {
              setErrorMsg(t("beheerBlockedQueue"));
            } else {
              setErrorMsg(data.error || t("error_GENERIC"));
            }
          } else {
            setErrorMsg(data?.error || t("beheerUpdateError"));
          }
          setLoading(false);
          return;
        }

        trackAdminMemberUpdated({
          changed: data && "changed" in data && Array.isArray(data.changed) ? data.changed : undefined,
        });
        toast.success(t("beheerMemberUpdated"));
      } else {
        const res = await fetch("/api/admin/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: displayName.trim(),
            initials: initials.trim() || undefined,
          }),
        });

        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          setErrorMsg(data?.error || t("beheerCreateError"));
          setLoading(false);
          return;
        }

        trackAdminMemberCreated();
        toast.success(t("beheerMemberCreated"));
      }

      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Er is iets misgegaan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-[#131B2E] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-slate-100">
            {isEditing ? t("beheerEditMember") : t("beheerAddMember")}
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            {isEditing
              ? t("beheerEditDesc")
              : t("beheerAddDesc")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* Avatar Preview */}
          <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <Avatar className="h-11 w-11 text-white font-bold shrink-0" style={{ backgroundColor: avatarColor }}>
              <AvatarFallback style={{ backgroundColor: avatarColor, color: "#fff" }}>
                {liveInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 dark:text-slate-100 truncate text-sm">
                {displayName.trim() || t("beheerPreviewName")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                slug: {liveSlugPreview}
              </p>
            </div>
            {isEditing && member && (
              <div>
                {member.ownedPassLabels.length > 0 ? (
                  <Badge variant="default" className="text-xs">
                    {t("beheerBadgeOwner")}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    {t("beheerBadgeGuest")}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Display Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              {t("beheerDisplayName")}
            </label>
            <input
              type="text"
              required
              autoFocus
              minLength={2}
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="bijv. Sam"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/90 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          {/* Initials */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              {t("beheerInitials")}
            </label>
            <input
              type="text"
              maxLength={2}
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase())}
              placeholder={deriveInitials(displayName || "L")}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/90 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500 uppercase font-medium"
            />
          </div>

          {/* Active Status Toggle (Edit only) */}
          {isEditing && (
            <div className="space-y-1.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("beheerActive")}
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("beheerInactiveHelp")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={isActive === 1}
                  disabled={isActive === 1 && Boolean(deactivationBlockReason)}
                  onChange={(e) => setIsActive(e.target.checked ? 1 : 0)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-50"
                />
              </div>
              {isActive === 1 && deactivationBlockReason && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {deactivationBlockReason}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-3 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700"
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t("saving") : isEditing ? t("save") : t("add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
