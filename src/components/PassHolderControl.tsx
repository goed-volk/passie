"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserCheck } from "lucide-react";
import { t } from "@/i18n/t";
import type { MemberRef } from "@/server/snapshot";

interface PassHolderControlProps {
  passId: string;
  currentHolder: MemberRef | null;
  allMembers: MemberRef[];
}

export function PassHolderControl({
  passId,
  currentHolder,
  allMembers,
}: PassHolderControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSelectNewHolder = async (toMemberId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pass/${passId}/holder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toMemberId, kind: "handover" }),
      });

      if (res.ok) {
        toast.success(t("holderUpdated"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Bijwerken mislukt");
      }
    } catch {
      toast.error("Er ging iets mis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="dark:bg-[#131B2E] dark:border-slate-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between text-slate-600 dark:text-slate-300">
          <div className="flex items-center space-x-2">
            <UserCheck className="h-4 w-4" />
            <span>{t("holder")}</span>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                Houder wijzigen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md dark:bg-[#131B2E] dark:border-slate-800">
              <DialogHeader>
                <DialogTitle className="dark:text-slate-100">Wie heeft de pas nu?</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 pt-2 max-h-72 overflow-y-auto">
                {allMembers.map((m) => (
                  <button
                    key={m.id}
                    disabled={loading}
                    onClick={() => handleSelectNewHolder(m.id)}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/80 flex items-center space-x-2 text-left transition-colors"
                  >
                    <Avatar
                      className="h-6 w-6"
                      style={{ backgroundColor: m.avatarColor }}
                    >
                      <AvatarFallback style={{ backgroundColor: m.avatarColor }}>
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
        </CardTitle>
      </CardHeader>
      <CardContent>
        {currentHolder ? (
          <div className="flex items-center space-x-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3">
            <Avatar
              className="h-9 w-9"
              style={{ backgroundColor: currentHolder.avatarColor }}
            >
              <AvatarFallback style={{ backgroundColor: currentHolder.avatarColor }}>
                {currentHolder.initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {currentHolder.displayName}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Heeft de fysieke kaart nu in bezit
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500 dark:text-slate-400">Onbekend</div>
        )}
      </CardContent>
    </Card>
  );
}
