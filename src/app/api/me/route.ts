import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getActingSession } from "@/server/actingMember";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const sessionResult = await getActingSession(db);
  return NextResponse.json({
    member: sessionResult.member,
    user: sessionResult.user,
    status: sessionResult.status,
  });
}
