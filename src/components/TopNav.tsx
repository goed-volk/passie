"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Megaphone, Settings, TicketCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { MemberRef, PoolSnapshot } from "@/server/snapshot";
import { t } from "@/i18n/t";
import { RemindOwnersDialog } from "@/components/RemindOwnersDialog";

export interface RemindContext {
  gamePoolId: string;
  matchLabel: string;
  unindicatedPasses: PoolSnapshot["passes"];
}

export function TopNav({
  actingMember,
  remindContext,
}: {
  actingMember: MemberRef | null;
  remindContext?: RemindContext;
}) {
  const [remindOpen, setRemindOpen] = useState(false);

  const canRemind =
    actingMember?.role === "admin" &&
    Boolean(remindContext && remindContext.unindicatedPasses.length > 0);

  return (
    <nav className="flex items-center justify-between py-2">
      <Link href="/" className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-slate-100 flex items-center space-x-2">
        <TicketCheck className="h-6 w-6 text-[var(--club-primary)] shrink-0" />
        <span>Passie</span>
      </Link>

      <div className="flex items-center space-x-1 sm:space-x-2">
        {canRemind && remindContext && (
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setRemindOpen(true)}
              className="h-9 px-2.5 sm:px-3 flex items-center space-x-1.5 rounded-xl border border-amber-500/30 dark:border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 dark:hover:bg-amber-950/50 transition-colors text-xs font-semibold shadow-xs"
              aria-label={t("ariaRemindUnindicated")}
              title={t("ariaRemindUnindicated")}
            >
              <Megaphone className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">{t("remindButtonLabel")}</span>
            </button>
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1 sm:mx-2" aria-hidden="true" />
            <RemindOwnersDialog
              open={remindOpen}
              onOpenChange={setRemindOpen}
              gamePoolId={remindContext.gamePoolId}
              matchLabel={remindContext.matchLabel}
              unindicatedPasses={remindContext.unindicatedPasses}
            />
          </div>
        )}

        <ThemeToggle variant="icon" />

        <Link
          href="/wedstrijden"
          className="h-11 w-11 p-2.5 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label={t("ariaNavFixtures")}
        >
          <Calendar className="h-5 w-5" />
        </Link>

        <Link
          href="/instellingen"
          className="h-11 w-11 p-2.5 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label={t("ariaNavSettings")}
        >
          <Settings className="h-5 w-5" />
        </Link>

        {actingMember && (
          <Link
            href="/instellingen"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={t("ariaNavProfileSettings")}
          >
            <Avatar
              className="h-8 w-8 ring-2 ring-slate-200 dark:ring-slate-700 hover:ring-slate-400 dark:hover:ring-slate-500 transition-all"
              style={{ backgroundColor: actingMember.avatarColor }}
            >
              <AvatarFallback style={{ backgroundColor: actingMember.avatarColor }}>
                {actingMember.initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        )}
      </div>
    </nav>
  );
}
