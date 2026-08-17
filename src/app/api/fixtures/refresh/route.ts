import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import {
  ingestClubFixtures,
  checkIngestCooldown,
  getIngestCooldownSeconds,
} from "@/server/ingest";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = checkIngestCooldown();
  return NextResponse.json({
    ok: true,
    ...status,
  });
}

export async function handleRefreshPost(d1Override?: D1Database) {
  const cooldownCheck = checkIngestCooldown();
  if (!cooldownCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "COOLDOWN_ACTIVE",
        message: `Wacht nog ${Math.ceil(cooldownCheck.remainingSeconds)} seconden voor een nieuwe synchronisatie.`,
        remainingSeconds: cooldownCheck.remainingSeconds,
        cooldownSeconds: cooldownCheck.cooldownSeconds,
      },
      { status: 429 }
    );
  }

  const db = await getDb(d1Override);
  try {
    const result = await ingestClubFixtures(db, "excelsior");
    return NextResponse.json({
      ok: true,
      result,
      cooldownSeconds: getIngestCooldownSeconds(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST() {
  return handleRefreshPost();
}
