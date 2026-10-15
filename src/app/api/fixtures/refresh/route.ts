import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getActingMember } from "@/server/actingMember";
import { assertSameOrigin } from "@/server/http/assertSameOrigin";
import {
  ingestClubFixtures,
  checkIngestCooldown,
  getIngestCooldownSeconds,
} from "@/server/ingest";
import { captureServerException } from "@/server/telemetryConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = checkIngestCooldown();
  return NextResponse.json({
    ok: true,
    ...status,
  });
}

export async function handleRefreshPost(d1Override?: D1Database) {
  const db = await getDb(d1Override);
  const actor = await getActingMember(db);

  if (!actor) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED",
        message: "Authenticatie vereist om wedstrijden te verversen.",
      },
      { status: 401 }
    );
  }

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

  try {
    const result = await ingestClubFixtures(db, "excelsior");
    return NextResponse.json({
      ok: true,
      result,
      cooldownSeconds: getIngestCooldownSeconds(),
    });
  } catch (err: unknown) {
    await captureServerException({
      error: err,
      distinctId: actor.id,
      context: { source: "api_fixtures_refresh" },
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request?: Request) {
  if (request) {
    try {
      assertSameOrigin(request);
    } catch {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN", message: "Verboden verzoek." },
        { status: 403 }
      );
    }
  }
  return handleRefreshPost();
}
