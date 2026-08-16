import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Settings } from "lucide-react";
import type { MemberRef } from "@/server/snapshot";

export function TopNav({ actingMember }: { actingMember: MemberRef | null }) {
  return (
    <nav className="flex items-center justify-between py-2">
      <Link href="/" className="font-extrabold text-xl tracking-tight text-slate-900 flex items-center space-x-1.5">
        <span className="h-3 w-3 rounded-full bg-[var(--club-primary)] inline-block" />
        <span>Passie</span>
      </Link>

      <div className="flex items-center space-x-2">
        <Link
          href="/wedstrijden"
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          aria-label="Wedstrijden"
        >
          <Calendar className="h-5 w-5" />
        </Link>

        <Link
          href="/instellingen"
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          aria-label="Instellingen"
        >
          <Settings className="h-5 w-5" />
        </Link>

        {actingMember && (
          <Link href="/wie-ben-jij">
            <Avatar
              className="h-8 w-8 ring-2 ring-slate-200 hover:ring-slate-400 transition-all"
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
