"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Check, ArrowUpRight, RotateCcw } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { t } from "@/i18n/t";
import type { PoolSnapshot, MemberRef } from "@/server/snapshot";

interface PassCardProps {
  pass: PoolSnapshot["passes"][number];
  fixtureOpponent?: string;
  allMembers?: MemberRef[];
  onIndicate: (passId: string, action: "keep" | "release" | "giveBack") => Promise<void>;
  onTransfer?: (passId: string, toMemberId: string) => Promise<void>;
  loading: boolean;
}

export function PassCard({
  pass,
  fixtureOpponent,
  allMembers,
  onIndicate,
  onTransfer,
  loading,
}: PassCardProps) {
  const [openHolderDialog, setOpenHolderDialog] = useState(false);
  const [openReclaimDialog, setOpenReclaimDialog] = useState(false);
  const [openGiveBackDialog, setOpenGiveBackDialog] = useState(false);
  const [isTransferringLocal, setIsTransferringLocal] = useState(false);
  const [isReclaimingLocal, setIsReclaimingLocal] = useState(false);
  const [isGivingBackLocal, setIsGivingBackLocal] = useState(false);

  const claimantDisplayName = pass.claimant
    ? pass.claimant.kind === "guest"
      ? `${pass.claimant.member.displayName}${t("guestOf")}${pass.claimant.guestName ? ` (${pass.claimant.guestName})` : ""}`
      : pass.claimant.member.displayName
    : t("currentAllocation");

  const ownersDisplayName = pass.owners.map((o) => o.displayName).join(" & ");

  const getStatusBadge = () => {
    switch (pass.status) {
      case "unindicated":
        return <Badge variant="gray">{t("statusUnindicated")}</Badge>;
      case "kept":
        return <Badge variant="success">{t("statusKept")}</Badge>;
      case "released":
        return <Badge variant="warning">{t("statusReleased")}</Badge>;
      case "assigned":
        return (
          <Badge variant="info">
            {t("claimedBy")}{" "}
            {pass.claimant?.kind === "guest"
              ? `${pass.claimant.member.displayName}${t("guestOf")}`
              : pass.claimant?.member.displayName}
          </Badge>
        );
    }
  };

  const handleSelectNewHolder = async (toMemberId: string) => {
    if (!onTransfer || isTransferringLocal) return;
    setIsTransferringLocal(true);
    try {
      await onTransfer(pass.id, toMemberId);
      setOpenHolderDialog(false);
    } finally {
      setIsTransferringLocal(false);
    }
  };

  const handleConfirmReclaim = async () => {
    setIsReclaimingLocal(true);
    try {
      await onIndicate(pass.id, "keep");
      setOpenReclaimDialog(false);
    } finally {
      setIsReclaimingLocal(false);
    }
  };

  const handleConfirmGiveBack = async () => {
    setIsGivingBackLocal(true);
    try {
      await onIndicate(pass.id, "giveBack");
      setOpenGiveBackDialog(false);
    } finally {
      setIsGivingBackLocal(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <Link
              href={`/pas/${pass.id}`}
              className="text-base font-bold text-slate-900 dark:text-slate-100 hover:underline inline-flex items-center gap-2"
            >
              <span>{pass.label}</span>
              {pass.seatInfo && (
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                  · {pass.seatInfo}
                </span>
              )}
            </Link>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {t("coOwners")}: {ownersDisplayName}
            </p>
          </div>
          <div className="shrink-0">{getStatusBadge()}</div>
        </div>

        {/* Holder Information */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
          <span className="text-slate-400 dark:text-slate-500 font-medium">{t("holder")}:</span>
          {onTransfer && allMembers && allMembers.length > 0 ? (
            <Dialog open={openHolderDialog} onOpenChange={setOpenHolderDialog}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  disabled={loading || isTransferringLocal}
                  className="inline-flex min-h-[44px] items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 transition-all cursor-pointer group shadow-2xs focus:outline-none focus:ring-2 focus:ring-[var(--club-primary)]"
                  title={t("changeHolderTitle")}
                >
                  {pass.holder ? (
                    <>
                      <Avatar
                        className="h-4 w-4 ring-1 ring-black/5 dark:ring-white/10"
                        style={{ backgroundColor: pass.holder.avatarColor }}
                      >
                        <AvatarFallback
                          style={{ backgroundColor: pass.holder.avatarColor }}
                          className="text-[9px]"
                        >
                          {pass.holder.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                        {pass.holder.displayName}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium text-xs text-slate-500">{t("unknownHolder")}</span>
                  )}
                  <ArrowRightLeft className="h-3 w-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors shrink-0 ml-0.5" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md dark:bg-[#131B2E] dark:border-slate-800">
                <DialogHeader>
                  <DialogTitle className="dark:text-slate-100">{t("changeHolderTitle")}</DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                    {t("changeHolderDesc")}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-2 pt-2 max-h-72 overflow-y-auto">
                  {allMembers.map((m) => (
                    <button
                      key={m.id}
                      disabled={loading || isTransferringLocal}
                      onClick={() => handleSelectNewHolder(m.id)}
                      className={`p-2.5 rounded-xl border flex items-center space-x-2 text-left transition-colors ${
                        pass.holder?.id === m.id
                          ? "border-[var(--club-primary)] bg-red-50/50 dark:bg-red-950/20 ring-1 ring-[var(--club-primary)]"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/80"
                      }`}
                    >
                      <Avatar
                        className="h-6 w-6"
                        style={{ backgroundColor: m.avatarColor }}
                      >
                        <AvatarFallback style={{ backgroundColor: m.avatarColor }} className="text-[10px]">
                          {m.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {m.displayName}
                      </span>
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            pass.holder && (
              <div className="flex items-center space-x-1.5">
                <Avatar
                  className="h-4 w-4 ring-1 ring-black/5 dark:ring-white/10"
                  style={{ backgroundColor: pass.holder.avatarColor }}
                >
                  <AvatarFallback
                    style={{ backgroundColor: pass.holder.avatarColor }}
                    className="text-[9px]"
                  >
                    {pass.holder.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {pass.holder.displayName}
                </span>
              </div>
            )
          )}
        </div>

        {/* Action buttons */}
        {pass.canIndicate && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              size="sm"
              variant="club"
              disabled={loading}
              onClick={async () => {
                try {
                  await onIndicate(pass.id, "keep");
                } catch {
                  // Handled in mutation
                }
              }}
              className={`w-full min-w-0 transition-all ${
                pass.status === "kept"
                  ? "ring-2 ring-[var(--club-primary)] ring-offset-2 ring-offset-white dark:ring-offset-slate-900 font-bold"
                  : ""
              }`}
            >
              <Check className="h-3.5 w-3.5 mr-1 shrink-0" />
              <span className="truncate">{t("actionKeep")}</span>
            </Button>
            <Button
              size="sm"
              disabled={loading}
              onClick={async () => {
                try {
                  await onIndicate(pass.id, "release");
                } catch {
                  // Handled in mutation
                }
              }}
              className={`w-full min-w-0 transition-all border-2 border-emerald-600 dark:border-emerald-500 text-emerald-950 dark:text-emerald-100 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 ${
                pass.status === "released"
                  ? "shadow-sm ring-2 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 font-bold"
                  : "font-semibold"
              }`}
            >
              {pass.status === "released" ? (
                <Check className="h-3.5 w-3.5 mr-1 shrink-0 text-emerald-700 dark:text-emerald-300" />
              ) : (
                <ArrowUpRight className="h-3.5 w-3.5 mr-1 shrink-0 text-emerald-700 dark:text-emerald-300" />
              )}
              <span className="truncate">{t("actionRelease")}</span>
            </Button>
          </div>
        )}

        {pass.canReclaim && (
          <div className="pt-1">
            <Dialog open={openReclaimDialog} onOpenChange={setOpenReclaimDialog}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="club"
                  disabled={loading || isReclaimingLocal}
                  className="w-full min-w-0 flex items-center justify-center space-x-1.5 shadow-sm font-semibold"
                >
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t("actionReclaim")}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md dark:bg-[#131B2E] dark:border-slate-800">
                <DialogHeader>
                  <DialogTitle className="dark:text-slate-100">
                    {t("reclaimConfirmTitle", { name: claimantDisplayName })}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 dark:text-slate-400 pt-1">
                    {t("reclaimConfirmDesc", { name: claimantDisplayName })}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end space-x-2 pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={loading || isReclaimingLocal}
                    onClick={() => setOpenReclaimDialog(false)}
                    className="dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="club"
                    disabled={loading || isReclaimingLocal}
                    onClick={handleConfirmReclaim}
                  >
                    {t("reclaimConfirmSubmit")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {pass.canGiveBack && (
          <div className="pt-1">
            <Dialog open={openGiveBackDialog} onOpenChange={setOpenGiveBackDialog}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={loading || isGivingBackLocal}
                  className="w-full min-w-0 flex items-center justify-center space-x-1.5"
                >
                  <span className="truncate">{t("actionGiveBack")}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md dark:bg-[#131B2E] dark:border-slate-800">
                <DialogHeader>
                  <DialogTitle className="dark:text-slate-100">
                    {t("giveBackConfirmTitle", {
                      fixture: fixtureOpponent ? `Excelsior – ${fixtureOpponent}` : "deze wedstrijd",
                    })}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 dark:text-slate-400 pt-1">
                    {t("giveBackConfirmDesc")}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end space-x-2 pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={loading || isGivingBackLocal}
                    onClick={() => setOpenGiveBackDialog(false)}
                    className="dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={loading || isGivingBackLocal}
                    onClick={handleConfirmGiveBack}
                  >
                    {t("giveBackConfirmButton")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
