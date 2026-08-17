import { PassCard } from "./PassCard";
import { t } from "@/i18n/t";
import type { PoolSnapshot, MemberRef } from "@/server/snapshot";

interface PassListProps {
  passes: PoolSnapshot["passes"];
  allMembers?: MemberRef[];
  onIndicate: (passId: string, action: "keep" | "release" | "giveBack") => Promise<void>;
  onTransfer?: (passId: string, toMemberId: string) => Promise<void>;
  loading: boolean;
}

export function PassList({
  passes,
  allMembers,
  onIndicate,
  onTransfer,
  loading,
}: PassListProps) {
  // Sort passes so unindicated float to top, followed by sortOrder
  const sortedPasses = [...passes].sort((a, b) => {
    if (a.status === "unindicated" && b.status !== "unindicated") return -1;
    if (a.status !== "unindicated" && b.status === "unindicated") return 1;
    return a.sortOrder - b.sortOrder;
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t("step1Title")}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("step1Subtitle")}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {sortedPasses.map((pass) => (
          <PassCard
            key={pass.id}
            pass={pass}
            allMembers={allMembers}
            onIndicate={onIndicate}
            onTransfer={onTransfer}
            loading={loading}
          />
        ))}
      </div>
    </section>
  );
}
