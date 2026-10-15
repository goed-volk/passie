import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { ingestClubFixtures } from "@/server/ingest";
import { captureServerException } from "@/server/telemetryConfig";

export const dynamic = "force-dynamic";

export const GET = POST;

export async function POST(request: Request) {
  const cronSecret = process.env.PASSIE_CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron secret is not configured on server" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  try {
    const result = await ingestClubFixtures(db, "excelsior");
    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    await captureServerException({
      error: err,
      distinctId: "system_cron",
      context: { source: "api_cron_ingest" },
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
