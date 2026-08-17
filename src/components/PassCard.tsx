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

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <Link
              href={`/pas/${pass.id}`}
              className="text-base font-bold text-slate-900 dark:text-slate-100 hover:underline"
            >
              {pass.label}
            </Link>
            {pass.seatInfo && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{pass.seatInfo}</p>
            )}
          </div>
          {getStatusBadge()}
        </div>

        {/* Owners & Holder Information */}
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 dark:text-slate-500">{t("coOwners")}:</span>
            <div className="flex -space-x-1.5 overflow-hidden">
              {pass.owners.map((owner) => (
                <Avatar
                  key={owner.id}
                  className="h-6 w-6 border-2 border-white dark:border-[#131B2E]"
                  style={{ backgroundColor: owner.avatarColor }}
                >
                  <AvatarFallback style={{ backgroundColor: owner.avatarColor }}>
                    {owner.initials}
                  </AvatarFallback>
                </Avatar>
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
