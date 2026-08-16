import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { getActingMemberId } from "@/server/actingMember";
import { findNextHomeFixture, ensurePool } from "@/server/ensurePool";
import { buildPoolSnapshot } from "@/server/snapshot";
import { HomeScreen } from "@/components/HomeScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const db = await getDb();
  const actingMemberId = await getActingMemberId();

  if (!actingMemberId) {
    redirect("/wie-ben-jij");
  }

  // Find next home fixture
  const fixture = await findNextHomeFixture(db);
  if (!fixture) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center space-y-3">
        <h1 className="text-xl font-bold">Geen wedstrijden gevonden</h1>
        <p className="text-sm text-slate-500">
          Er zijn momenteel geen geplande thuiswedstrijden.
        </p>
      </main>
    );
  }

  const pool = await ensurePool(db, "group_goedvolk", fixture.id);
  const snapshot = await buildPoolSnapshot(db, pool.id, actingMemberId);

  if (!snapshot) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-bold">Wedstrijd kon niet worden geladen</h1>
      </main>
    );
  }

  return <HomeScreen gamePoolId={pool.id} initialSnapshot={snapshot} />;
}
