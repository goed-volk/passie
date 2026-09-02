import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdminApi, assertCapability } from "@/server/adminAuth";
import { updateMember, type MemberUpdatableField } from "@/server/adminMembers";

export const dynamic = "force-dynamic";

const UpdateMemberSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  initials: z.string().trim().min(1).max(2).optional(),
  avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.union([z.literal(0), z.literal(1)]).optional(),
});

const ADMIN_ALLOWED_FIELDS: MemberUpdatableField[] = [
  "displayName",
  "initials",
  "avatarColor",
  "sortOrder",
  "isActive",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const auth = await requireAdminApi();
  if (auth instanceof Response) {
    return auth;
  }
  if (!assertCapability(auth.principal, "members.write")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const { memberId } = await params;
  if (!memberId) {
    return NextResponse.json({ error: "Missing memberId parameter" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const db = await getDb();
  try {
    const result = await updateMember(
      db,
      memberId,
      parsed.data,
      ADMIN_ALLOWED_FIELDS,
      auth.principal
    );

    if (!result.ok) {
      if (result.error === "deactivation_blocked") {
        return NextResponse.json(
          {
            error: "Deactivation blocked",
            reason: result.reason,
            details: "details" in result ? result.details : undefined,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: (result as { error?: string }).error || "Update failed" },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
