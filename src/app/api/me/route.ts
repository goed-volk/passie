import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/server/db";
import { COOKIE_NAME, getActingMember } from "@/server/actingMember";
import { eq } from "drizzle-orm";
import * as schema from "@/server/schema";

export const dynamic = "force-dynamic";

const SetMeSchema = z.object({
  memberId: z.string().min(1),
});

export async function GET() {
  const db = await getDb();
  const actingMember = await getActingMember(db);
  return NextResponse.json({ member: actingMember });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = SetMeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const db = await getDb();
  const member = await db.query.members.findFirst({
    where: eq(schema.members.id, parsed.data.memberId),
  });

  if (!member || !member.isActive) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, member.id, {
    path: "/",
    maxAge: 31536000, // 1 year
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });

  return NextResponse.json({
    ok: true,
    member: {
      id: member.id,
      displayName: member.displayName,
      initials: member.initials,
      avatarColor: member.avatarColor,
      slug: member.slug,
    },
  });
}
