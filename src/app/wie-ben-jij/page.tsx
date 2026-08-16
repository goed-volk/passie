import { getDb } from "@/server/db";
import * as schema from "@/server/schema";
import { asc, eq } from "drizzle-orm";
import { MemberPicker } from "@/components/MemberPicker";

export const dynamic = "force-dynamic";

export default async function WieBenJijPage() {
  const db = await getDb();
  const members = await db.query.members.findMany({
    where: eq(schema.members.isActive, 1),
    orderBy: [asc(schema.members.sortOrder)],
  });

  const memberRefs = members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    initials: m.initials,
    avatarColor: m.avatarColor,
    slug: m.slug,
  }));

  return (
    <main className="min-h-[100dvh] flex flex-col justify-center items-center py-10 px-4">
      <MemberPicker members={memberRefs} />
    </main>
  );
}
