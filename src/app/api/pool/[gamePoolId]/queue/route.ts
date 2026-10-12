import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { getActingMember } from "@/server/actingMember";
import { mutate } from "@/server/commit";
import { buildPoolSnapshot } from "@/server/snapshot";
import { assertSameOrigin } from "@/server/http/assertSameOrigin";

export const dynamic = "force-dynamic";

const JoinQueueSchema = z.object({
  kind: z.enum(["self", "guest"]).default("self"),
  guestName: z.string().trim().max(60).optional().nullable(),
});

export async function POST(
  request: Request,
  props: { params: Promise<{ gamePoolId: string }> }
) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const { gamePoolId } = await props.params;
  const db = await getDb();
  const actor = await getActingMember(db);

  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  const actorId = actor.id;

  const body = await request.json().catch(() => ({}));
  const parsed = JoinQueueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");

  const domainAction = {
    type: "JoinQueue" as const,
    nextEntryId: 0, // Calculated dynamically inside mutate()
    kind: parsed.data.kind,
    guestName: parsed.data.guestName ?? null,
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
