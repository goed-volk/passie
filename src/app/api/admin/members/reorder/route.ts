import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAdminApi, assertCapability } from "@/server/adminAuth";
import { reorderMembers, resolveAdminGroup } from "@/server/adminMembers";
import { assertSameOrigin } from "@/server/http/assertSameOrigin";
import { captureServerException } from "@/server/telemetryConfig";

export const dynamic = "force-dynamic";

const ReorderSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1),
});

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

  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const db = await getDb();
  const group = await resolveAdminGroup(db);

  try {
    const result = await reorderMembers(
      db,
      group.id,
      parsed.data.memberIds,
      auth.principal
    );
    return NextResponse.json(result);
  } catch (err: unknown) {
    await captureServerException({
      error: err,
      distinctId: auth.principal.memberId ?? "system_admin",
      context: { source: "api_admin_members_reorder" },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
