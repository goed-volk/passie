import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Settings, TicketCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { MemberRef } from "@/server/snapshot";

export function TopNav({ actingMember }: { actingMember: MemberRef | null }) {
  return (
    <nav className="flex items-center justify-between py-2">
      <Link href="/" className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-slate-100 flex items-center space-x-2">
        <TicketCheck className="h-6 w-6 text-[var(--club-primary)] shrink-0" />
        <span>Passie</span>
      </Link>

      <div className="flex items-center space-x-1 sm:space-x-2">
        <ThemeToggle variant="icon" />

        <Link
          href="/wedstrijden"
          className="h-11 w-11 p-2.5 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Wedstrijden"
        >
          <Calendar className="h-5 w-5" />
        </Link>

        <Link
          href="/instellingen"
          className="h-11 w-11 p-2.5 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Instellingen"
        >
          <Settings className="h-5 w-5" />
        </Link>

        {actingMember && (
          <Link
            href="/wie-ben-jij"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Wie ben jij"
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
