import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getActingMemberId } from "@/server/actingMember";
import { buildPoolSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  props: { params: Promise<{ gamePoolId: string }> }
) {
  const { gamePoolId } = await props.params;
  const db = await getDb();
  const actingMemberId = await getActingMemberId();

  const snapshot = await buildPoolSnapshot(db, gamePoolId, actingMemberId);
  if (!snapshot) {
    return NextResponse.json({ error: "Game pool not found" }, { status: 404 });
  }

  return NextResponse.json({ pool: snapshot });
}
