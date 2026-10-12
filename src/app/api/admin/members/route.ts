import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdminApi, assertCapability } from "@/server/adminAuth";
import { createMember, listAdminMembers, resolveAdminGroup } from "@/server/adminMembers";
import { assertSameOrigin } from "@/server/http/assertSameOrigin";

export const dynamic = "force-dynamic";

const CreateMemberSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  initials: z.string().trim().min(1).max(2).optional(),
  avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "member"]).optional(),
});

export async function GET() {
  const auth = await requireAdminApi();
  if (auth instanceof Response) {
    return auth;
  }
  if (!assertCapability(auth.principal, "members.read")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const db = await getDb();
  const group = await resolveAdminGroup(db);
  const members = await listAdminMembers(db, group.id);

  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden: cross-origin request rejected" }, { status: 403 });
  }

  const auth = await requireAdminApi();
  if (auth instanceof Response) {
    return auth;
  }
  if (!assertCapability(auth.principal, "members.write")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const db = await getDb();
  const group = await resolveAdminGroup(db);

  try {
    const newMember = await createMember(db, group.id, parsed.data, auth.principal);
    return NextResponse.json({ ok: true, member: newMember }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
