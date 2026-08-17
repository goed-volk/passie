"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";
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
  allMembers?: MemberRef[];
  onIndicate: (passId: string, action: "keep" | "release" | "giveBack") => Promise<void>;
  onTransfer?: (passId: string, toMemberId: string) => Promise<void>;
  loading: boolean;
}

export function PassCard({
  pass,
  allMembers,
  onIndicate,
  onTransfer,
  loading,
}: PassCardProps) {
  const [openHolderDialog, setOpenHolderDialog] = useState(false);
  const [isTransferringLocal, setIsTransferringLocal] = useState(false);

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
              ? `${pass.claimant.member.displayName}'s gast`
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
            </Link>
            {pass.seatInfo && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {pass.seatInfo}
              </p>
            )}
          </div>
          <div className="shrink-0">{getStatusBadge()}</div>
        </div>

        {/* Owners & Holder Information */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
          {/* Owners / Pas van */}
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 dark:text-slate-500 font-medium">{t("coOwners")}:</span>
            <div className="flex items-center space-x-1.5">
              {pass.owners.map((owner) => (
                <div
                  key={owner.id}
                  title={owner.displayName}
                  className="group relative cursor-help"
                >
                  <Avatar
                    className="h-6 w-6 ring-1 ring-black/10 dark:ring-white/10"
                    style={{ backgroundColor: owner.avatarColor }}
                  >
                    <AvatarFallback style={{ backgroundColor: owner.avatarColor }} className="text-[10px]">
                      {owner.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 whitespace-nowrap rounded-md bg-slate-900 dark:bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-white dark:text-slate-900 shadow-md">
                    {owner.displayName}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Holder / Momenteel in bezit van */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400 dark:text-slate-500 font-medium">{t("holder")}:</span>
            {onTransfer && allMembers && allMembers.length > 0 ? (
              <Dialog open={openHolderDialog} onOpenChange={setOpenHolderDialog}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    disabled={loading || isTransferringLocal}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 transition-all cursor-pointer group shadow-2xs focus:outline-none focus:ring-2 focus:ring-[var(--club-primary)]"
                    title="Pashouder wijzigen"
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
        </div>

        {/* Action buttons */}
        {pass.canIndicate && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              size="sm"
              variant={pass.status === "kept" ? "default" : "outline"}
              disabled={loading}
              onClick={() => onIndicate(pass.id, "keep")}
              className="w-full"
            >
              {t("actionKeep")}
            </Button>
            <Button
              size="sm"
              variant={pass.status === "released" ? "default" : "outline"}
              disabled={loading}
              onClick={() => onIndicate(pass.id, "release")}
              className="w-full text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              {t("actionRelease")}
            </Button>
          </div>
        )}

        {pass.canGiveBack && (
          <div className="pt-1">
            <Button
              size="sm"
              variant="destructive"
              disabled={loading}
              onClick={() => onIndicate(pass.id, "giveBack")}
              className="w-full"
            >
              {t("actionGiveBack")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
