import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getActingMemberId } from "@/server/actingMember";
import { mutate } from "@/server/commit";
import { buildPoolSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  props: { params: Promise<{ gamePoolId: string; entryId: string }> }
) {
  const { gamePoolId, entryId } = await props.params;
  const entryIdNum = parseInt(entryId, 10);
  if (isNaN(entryIdNum)) {
    return NextResponse.json({ error: "Invalid entry ID" }, { status: 400 });
  }

  const db = await getDb();
  const actorId = await getActingMemberId();

  if (!actorId) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");

  const domainAction = {
    type: "CancelQueueEntry" as const,
    entryId: entryIdNum,
  };

  const result = await mutate(db, gamePoolId, domainAction, actorId, {
    idempotencyKey,
  });

  if (!result.ok) {
    const status =
      result.error.code === "CONFLICT_RETRY_EXHAUSTED" ? 409 : 422;
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status }
    );
  }

  const snapshot = await buildPoolSnapshot(db, gamePoolId, actorId);
  return NextResponse.json({ pool: snapshot });
}
