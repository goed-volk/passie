import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getActingMember } from "@/server/actingMember";
import { buildPoolSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  props: { params: Promise<{ gamePoolId: string }> }
) {
  const { gamePoolId } = await props.params;
  const db = await getDb();
  const actor = await getActingMember(db);

  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const snapshot = await buildPoolSnapshot(db, gamePoolId, actor.id);
  if (!snapshot) {
    return NextResponse.json({ error: "Game pool not found" }, { status: 404 });
  }

  return NextResponse.json({ pool: snapshot });
}
