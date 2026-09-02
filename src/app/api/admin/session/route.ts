import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  constantTimeEquals,
  createSessionToken,
  getAdminPassword,
  type AdminPrincipal,
} from "@/server/adminAuth";

export const dynamic = "force-dynamic";

const SessionSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const adminPassword = await getAdminPassword();
  if (!adminPassword) {
    return NextResponse.json(
      { error: "Admin password is not configured on server" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const isValid = await constantTimeEquals(parsed.data.password, adminPassword);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const principal: AdminPrincipal = {
    subject: "shared",
    method: "password",
    memberId: null,
  };

  const token = await createSessionToken(principal);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
