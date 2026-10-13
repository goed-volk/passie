"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Plus, Edit2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminMemberDialog } from "@/components/admin/AdminMemberDialog";
import { t } from "@/i18n/t";
import { trackAdminMembersReordered, trackSignOut, resetUser } from "@/lib/posthog";
import { authClient } from "@/lib/authClient";
import type { AdminMemberListItem } from "@/server/adminMembers";

interface BeheerDashboardClientProps {
  members: AdminMemberListItem[];
}

export function BeheerDashboardClient({ members: initialMembers }: BeheerDashboardClientProps) {
  const router = useRouter();
  const [prevInitialMembers, setPrevInitialMembers] = useState(initialMembers);
  const [membersList, setMembersList] = useState<AdminMemberListItem[]>(initialMembers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<AdminMemberListItem | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (prevInitialMembers !== initialMembers) {
    setPrevInitialMembers(initialMembers);
    setMembersList(initialMembers);
  }

  const handleOpenAdd = () => {
    setSelectedMember(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (member: AdminMemberListItem) => {
    setSelectedMember(member);
    setDialogOpen(true);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      trackSignOut();
      resetUser();
      await authClient.signOut();
      router.push("/inloggen");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

  const persistReorder = async (newList: AdminMemberListItem[]) => {
    const memberIds = newList.map((m) => m.id);
    try {
      const res = await fetch("/api/admin/members/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds }),
      });
      if (!res.ok) {
        toast.error(t("beheerReorderError"));
        setMembersList(initialMembers);
      } else {
        trackAdminMembersReordered({ memberCount: newList.length });
        toast.success(t("beheerReorderSuccess"));
      }
    } catch {
      toast.error("Fout bij opslaan van volgorde.");
      setMembersList(initialMembers);
    }
  };

  const moveMember = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= membersList.length || fromIndex === toIndex) return;
    const updated = [...membersList];
    const [moved] = updated.splice(fromIndex, 1);
    if (!moved) return;
    updated.splice(toIndex, 0, moved);
    setMembersList(updated);
    persistReorder(updated);
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    moveMember(draggedIndex, targetIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-6 pb-12 max-w-lg mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <Link
          href="/instellingen"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("navSettings")}</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-xs text-muted-foreground hover:text-destructive gap-1.5"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{t("beheerLogout")}</span>
        </Button>
      </div>

      {/* Title & Description */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("beheerTitle")}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("beheerSubtitle")}
          </p>
        </div>
        <Button onClick={handleOpenAdd} size="sm" className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          <span>{t("beheerAddMember")}</span>
        </Button>
      </div>

      {/* Members Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-foreground">
            {t("beheerMembersHeading")} ({membersList.length})
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {t("beheerDragHint")}
          </span>
        </div>

        <div className="space-y-2">
          {membersList.map((m, index) => {
            const isOwner = m.ownedPassLabels.length > 0;
            const holdsPass = m.holdsPassLabels.length > 0;
            const isInactive = m.isActive === 0;
            const isDragging = draggedIndex === index;
            const isOver = dragOverIndex === index;

            return (
              <Card
                key={m.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                className={`border transition-all select-none ${
                  isDragging ? "opacity-40 scale-[0.98] border-primary" : ""
                } ${
                  isOver ? "border-primary ring-2 ring-primary/30" : ""
                } ${
                  isInactive
                    ? "opacity-60 bg-muted/30 border-dashed border-border"
                    : "bg-card border-border shadow-xs hover:border-slate-400 dark:hover:border-slate-700"
                }`}
              >
                <CardContent className="p-3 flex items-center gap-2.5">
                  {/* Drag Handle */}
                  <div
                    className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-300"
                    title={t("beheerDragTitle")}
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>

                  {/* Avatar */}
                  <Avatar
                    className="h-10 w-10 text-white font-bold shrink-0"
                    style={{ backgroundColor: m.avatarColor }}
                  >
                    <AvatarFallback
                      style={{ backgroundColor: m.avatarColor, color: "#fff" }}
                    >
                      {m.initials}
                    </AvatarFallback>
                  </Avatar>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">
                        {m.displayName}
                      </span>
                      {isOwner ? (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                          {t("beheerBadgeOwner")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                          {t("beheerBadgeGuest")}
                        </Badge>
                      )}
                      {isInactive && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-dashed">
                          {t("beheerBadgeInactive")}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className="font-mono text-[11px]">{m.slug}</span>
                      <span>•</span>
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        #{index + 1}
                      </span>
                    </div>

                    {isOwner && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {t("beheerPassLabel", { pass: m.ownedPassLabels.join(", ") })}
                      </p>
                    )}

                    {holdsPass && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate mt-0.5 font-medium">
                        {t("beheerHoldsPassLabel", { pass: m.holdsPassLabels.join(", ") })}
                      </p>
                    )}
                  </div>

                  {/* Quick Reorder Up/Down arrows for mobile touch accessibility */}
                  <div className="flex flex-col gap-0.5 sm:hidden">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveMember(index, index - 1)}
                      className="p-1 text-slate-400 hover:text-foreground disabled:opacity-20"
                      aria-label={t("beheerMoveUp")}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === membersList.length - 1}
                      onClick={() => moveMember(index, index + 1)}
                      className="p-1 text-slate-400 hover:text-foreground disabled:opacity-20"
                      aria-label={t("beheerMoveDown")}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Edit Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(m)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Edit2 className="h-4 w-4" />
                    <span className="sr-only">{t("beheerEditMember")}</span>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Admin Member Dialog */}
      <AdminMemberDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        member={selectedMember}
      />
    </div>
  );
}
