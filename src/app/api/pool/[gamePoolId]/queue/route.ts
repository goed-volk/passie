import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { getActingMemberId } from "@/server/actingMember";
import { mutate } from "@/server/commit";
import { buildPoolSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

const JoinQueueSchema = z.object({
  kind: z.enum(["self", "guest"]).default("self"),
  guestName: z.string().optional().nullable(),
});

export async function POST(
  request: Request,
  props: { params: Promise<{ gamePoolId: string }> }
) {
  const { gamePoolId } = await props.params;
  const db = await getDb();
  const actorId = await getActingMemberId();

  if (!actorId) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

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
