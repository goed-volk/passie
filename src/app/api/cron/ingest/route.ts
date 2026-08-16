import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { ingestClubFixtures } from "@/server/ingest";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.PASSIE_CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  try {
    const result = await ingestClubFixtures(db, "excelsior");
    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
