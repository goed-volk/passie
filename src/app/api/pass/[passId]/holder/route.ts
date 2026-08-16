import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { getActingMemberId } from "@/server/actingMember";
import { eq } from "drizzle-orm";
import * as schema from "@/server/schema";

export const dynamic = "force-dynamic";

const SetHolderSchema = z.object({
  toMemberId: z.string().min(1),
  fixtureId: z.string().optional().nullable(),
  kind: z.enum(["handover", "correction"]).default("handover"),
  note: z.string().optional().nullable(),
});

export async function POST(
  request: Request,
  props: { params: Promise<{ passId: string }> }
) {
  const { passId } = await props.params;
  const db = await getDb();
  const actorId = await getActingMemberId();

  if (!actorId) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = SetHolderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const pass = await db.query.passes.findFirst({
    where: eq(schema.passes.id, passId),
  });

  if (!pass) {
    return NextResponse.json({ error: "Pass not found" }, { status: 404 });
  }

  const toMember = await db.query.members.findFirst({
    where: eq(schema.members.id, parsed.data.toMemberId),
  });

  if (!toMember) {
    return NextResponse.json({ error: "Target member not found" }, { status: 404 });
  }

  const now = Math.floor(Date.now() / 1000);
  const fromMemberId = pass.holderMemberId;

  // 1. Update pass holder
  const updatePass = db
    .update(schema.passes)
    .set({ holderMemberId: toMember.id })
    .where(eq(schema.passes.id, passId));

  // 2. Append possession event
  const insertEvent = db.insert(schema.possessionEvents).values({
    id: `poss_${Date.now()}_${passId}`,
    passId,
    fromMemberId,
    toMemberId: toMember.id,
    actorMemberId: actorId,
    fixtureId: parsed.data.fixtureId ?? null,
    kind: parsed.data.kind,
    note: parsed.data.note ?? null,
    createdAt: now,
  });

  // 3. Append activity event for timeline if fixtureId is provided or generic
  const insertActivity = db.insert(schema.activityEvents).values({
    id: `evt_${Date.now()}_possession`,
    gamePoolId: parsed.data.fixtureId ? `pool_${pass.groupId}_${parsed.data.fixtureId}` : null,
    passId,
    actorMemberId: actorId,
    type: parsed.data.kind === "handover" ? "possession.handover" : "possession.corrected",
    payloadJson: JSON.stringify({
      passId,
      fromMemberId,
      toMemberId: toMember.id,
      kind: parsed.data.kind,
    }),
    createdAt: now,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.batch([updatePass, insertEvent, insertActivity] as any);

  return NextResponse.json({
    ok: true,
    pass: {
      id: passId,
      holderMemberId: toMember.id,
    },
  });
}
