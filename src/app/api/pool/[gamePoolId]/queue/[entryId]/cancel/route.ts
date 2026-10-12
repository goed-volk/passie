import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getActingMember } from "@/server/actingMember";
import { mutate } from "@/server/commit";
import { buildPoolSnapshot } from "@/server/snapshot";
import { assertSameOrigin } from "@/server/http/assertSameOrigin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  props: { params: Promise<{ gamePoolId: string; entryId: string }> }
) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const { gamePoolId, entryId } = await props.params;
  const entryIdNum = parseInt(entryId, 10);
  if (isNaN(entryIdNum)) {
    return NextResponse.json({ error: "Invalid entry ID" }, { status: 400 });
  }

  const db = await getDb();
  const actor = await getActingMember(db);

  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  const actorId = actor.id;

  const idempotencyKey = request.headers.get("Idempotency-Key");

  const domainAction = {
    type: "CancelQueueEntry" as const,
    entryId: entryIdNum,
  };

  const result = await mutate(db, gamePoolId, domainAction, actorId, {
    idempotencyKey,
  });

  if (!result.ok) {
    let status = 422;
    if (result.error.code === "CONFLICT_RETRY_EXHAUSTED") {
      status = 409;
    } else if (result.error.code === "POOL_NOT_FOUND") {
      status = 404;
    } else if (result.error.code === "INTERNAL_ERROR") {
      status = 500;
    }
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status }
    );
  }

  const snapshot = await buildPoolSnapshot(db, gamePoolId, actorId);
  return NextResponse.json({ pool: snapshot });
}
