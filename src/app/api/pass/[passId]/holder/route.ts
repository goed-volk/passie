import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { getActingMember } from "@/server/actingMember";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "@/server/schema";
import { mutate } from "@/server/commit";
import { buildPoolSnapshot } from "@/server/snapshot";
import { ensurePool, findNextHomeFixture } from "@/server/ensurePool";

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
  const actor = await getActingMember(db);

  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  const actorId = actor.id;

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
    return NextResponse.json({ error: "Pass not found", code: "PASS_NOT_FOUND" }, { status: 404 });
  }

  const toMember = await db.query.members.findFirst({
    where: and(
      eq(schema.members.id, parsed.data.toMemberId),
      eq(schema.members.groupId, pass.groupId),
      eq(schema.members.isActive, 1)
    ),
  });

  if (!toMember) {
    return NextResponse.json(
      { error: "Target member not found or inactive", code: "MEMBER_NOT_FOUND" },
      { status: 404 }
    );
  }

  // Resolve pool for the group
  let gamePool;
  if (parsed.data.fixtureId) {
    gamePool = await db.query.gamePools.findFirst({
      where: and(
        eq(schema.gamePools.groupId, pass.groupId),
        eq(schema.gamePools.fixtureId, parsed.data.fixtureId)
      ),
    });

    if (!gamePool) {
      const fixture = await db.query.fixtures.findFirst({
        where: eq(schema.fixtures.id, parsed.data.fixtureId),
      });
      if (!fixture) {
        return NextResponse.json(
          { error: "Fixture not found", code: "FIXTURE_NOT_FOUND" },
          { status: 404 }
        );
      }
      gamePool = await ensurePool(db, pass.groupId, fixture.id);
    }
  } else {
    const nextFixture = await findNextHomeFixture(db);
    if (nextFixture) {
      gamePool = await ensurePool(db, pass.groupId, nextFixture.id);
    } else {
      gamePool = await db.query.gamePools.findFirst({
        where: eq(schema.gamePools.groupId, pass.groupId),
        orderBy: [desc(schema.gamePools.createdAt)],
      });
    }
  }

  if (!gamePool) {
    return NextResponse.json(
      { error: "Game pool not found", code: "POOL_NOT_FOUND" },
      { status: 404 }
    );
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");

  const domainAction = {
    type: "RecordHandover" as const,
    passId,
    toMemberId: toMember.id,
    kind: parsed.data.kind,
    note: parsed.data.note ?? null,
  };

  const result = await mutate(db, gamePool.id, domainAction, actorId, {
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

  const snapshot = await buildPoolSnapshot(db, gamePool.id, actorId);

  return NextResponse.json({
    ok: true,
    pool: snapshot,
    pass: {
      id: passId,
      holderMemberId: toMember.id,
    },
  });
}
