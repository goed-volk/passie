import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/i18n/t";
import type { PoolSnapshot } from "@/server/snapshot";

interface PassCardProps {
  pass: PoolSnapshot["passes"][number];
  onIndicate: (passId: string, action: "keep" | "release" | "giveBack") => Promise<void>;
  loading: boolean;
}

export function PassCard({ pass, onIndicate, loading }: PassCardProps) {
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

  const ownersDisplayName = pass.owners.map((o) => o.displayName).join(" & ");

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <Link
              href={`/pas/${pass.id}`}
              className="text-base font-bold text-slate-900 dark:text-slate-100 hover:underline inline-flex items-center gap-2"
            >
              <span>{ownersDisplayName || pass.label}</span>
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 dark:text-slate-500">{t("coOwners")}:</span>
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
                    <AvatarFallback style={{ backgroundColor: owner.avatarColor }}>
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

          {pass.holder && (
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 dark:text-slate-500">{t("holder")}:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {pass.holder.displayName}
              </span>
            </div>
          )}
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
