"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { t } from "@/i18n/t";

interface Member {
  id: string;
  displayName: string;
  initials: string;
  avatarColor: string;
  slug: string;
}

export function MemberPicker({ members }: { members: Member[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSelect = async (memberId: string) => {
    setSelectedId(memberId);
    setLoading(true);

    try {
      const res = await fetch("/api/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t("whoAreYouTitle")}
        </h1>
        <p className="text-sm text-slate-600">
          {t("whoAreYouSubtitle")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {members.map((member) => {
          const isSelected = selectedId === member.id;
          return (
            <button
              key={member.id}
              disabled={loading}
              onClick={() => handleSelect(member.id)}
              className={`text-left p-3 rounded-2xl border transition-all active:scale-[0.98] ${
                isSelected
                  ? "border-[var(--club-primary)] ring-2 ring-[var(--club-primary)] bg-red-50/50"
                  : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center space-x-3">
                <Avatar style={{ backgroundColor: member.avatarColor }}>
                  <AvatarFallback style={{ backgroundColor: member.avatarColor }}>
                    {member.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="overflow-hidden">
                  <div className="font-semibold text-sm text-slate-900 truncate">
                    {member.displayName}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
