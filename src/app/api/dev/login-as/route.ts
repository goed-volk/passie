import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, type DbClient } from "@/server/db";
import * as schema from "@/server/schema";
import { getAuth } from "@/server/auth";
import { preCreateUserAndLink } from "@/server/authAdmin";

export const dynamic = "force-dynamic";

const LoginAsSchema = z.object({
  memberSlug: z.string().optional(),
  memberId: z.string().optional(),
  email: z.string().optional(),
});

export async function handleDevLogin(request: Request, customDb?: DbClient) {
  const host = request.headers.get("host") || "";
  const isLocalHost = host.startsWith("localhost") || host.startsWith("127.0.0.1");

  let isProduction = process.env.PASSIE_ENV === "production";
  let devLogin =
    process.env.PASSIE_DEV_LOGIN === "1" || process.env.NODE_ENV === "test";

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const cf = await getCloudflareContext({ async: true });
    const cfEnv = cf?.env as unknown as Record<string, unknown> | undefined;
    if (cfEnv) {
      if (cfEnv.PASSIE_ENV) isProduction = cfEnv.PASSIE_ENV === "production";
      if (cfEnv.PASSIE_DEV_LOGIN !== undefined) {
        devLogin = String(cfEnv.PASSIE_DEV_LOGIN) === "1";
      }
    }
  } catch {
    // Fallback to process.env
  }

  if (isProduction || !devLogin || !isLocalHost) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = LoginAsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const db = customDb ?? (await getDb());
  let member = null;

  if (parsed.data.memberId) {
    member = await db.query.members.findFirst({
      where: eq(schema.members.id, parsed.data.memberId),
    });
  } else if (parsed.data.memberSlug) {
    member = await db.query.members.findFirst({
      where: eq(schema.members.slug, parsed.data.memberSlug),
    });
  } else if (parsed.data.email) {
    const user = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.email, parsed.data.email.toLowerCase().trim()),
    });
    if (user) {
      member = await db.query.members.findFirst({
        where: eq(schema.members.userId, user.id),
      });
    }
  }

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Ensure member has a linked user_id in dev
  let userId = member.userId;
  if (!userId) {
    const email = `${member.slug}@example.com`;
    const res = await preCreateUserAndLink(db, {
      memberId: member.id,
      email,
      name: member.displayName,
    });
    userId = res.userId;
  }

  const auth = await getAuth({ db });
  const ctx = (await (auth as any).$context) as {
    test?: {
      login: (opts: { userId: string }) => Promise<{
        user: unknown;
        token: string;
        cookies: unknown;
        headers: Headers;
      }>;
    };
  };
  if (!ctx?.test) {
    return NextResponse.json(
      { error: "testUtils plugin not enabled" },
      { status: 500 }
    );
  }

  const loginResult = await ctx.test.login({ userId });
  const cookieHeader = loginResult.headers.get("cookie");

  const response = NextResponse.json({
    ok: true,
    member: {
      id: member.id,
      slug: member.slug,
      displayName: member.displayName,
    },
    user: loginResult.user,
    token: loginResult.token,
    cookie: cookieHeader,
  });

  const setCookie = loginResult.headers.get("set-cookie");
  if (setCookie) {
    response.headers.set("set-cookie", setCookie);
  }

  return response;
}

export async function POST(request: Request) {
  return handleDevLogin(request);
}
