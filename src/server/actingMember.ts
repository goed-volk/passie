import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";
import type { MemberRef } from "./snapshot";
import { getAuth } from "./auth";

export interface ActingSessionResult {
  session: unknown | null;
  user: { id: string; email: string; name: string; role?: string | null; banned?: boolean | null } | null;
  member: MemberRef | null;
  status: "unauthenticated" | "no_membership" | "active";
}

export async function getActingSession(
  db: DbClient,
  customHeaders?: Headers
): Promise<ActingSessionResult> {
  let reqHeaders: Headers;
  if (customHeaders) {
    reqHeaders = customHeaders;
  } else {
    try {
      reqHeaders = await headers();
    } catch {
      reqHeaders = new Headers();
    }
  }

  const auth = await getAuth({ db });
  const authSession = await auth.api.getSession({
    headers: reqHeaders,
  });

  if (!authSession || !authSession.user) {
    return {
      session: null,
      user: null,
      member: null,
      status: "unauthenticated",
    };
  }

  const user = authSession.user;

  // Find active members linked to this user_id
  const userMembers = await db.query.members.findMany({
    where: and(
      eq(schema.members.userId, user.id),
      eq(schema.members.isActive, 1)
    ),
  });

  if (userMembers.length === 0) {
    return {
      session: authSession.session,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: (user as Record<string, unknown>).role as string | null | undefined,
        banned: (user as Record<string, unknown>).banned as boolean | null | undefined,
      },
      member: null,
      status: "no_membership",
    };
  }

  // Alpha: 1 member (if multiple, use first active membership)
  const member = userMembers[0]!;

  const memberRef: MemberRef = {
    id: member.id,
    groupId: member.groupId,
    displayName: member.displayName,
    initials: member.initials,
    avatarColor: member.avatarColor,
    slug: member.slug,
    role: member.role as "admin" | "member",
    email: user.email,
    userId: user.id,
  };

  return {
    session: authSession.session,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: (user as Record<string, unknown>).role as string | null | undefined,
      banned: (user as Record<string, unknown>).banned as boolean | null | undefined,
    },
    member: memberRef,
    status: "active",
  };
}

export async function getActingMember(
  db: DbClient,
  customHeaders?: Headers
): Promise<MemberRef | null> {
  const { member } = await getActingSession(db, customHeaders);
  return member;
}

export async function getActingMemberId(
  db?: DbClient,
  customHeaders?: Headers
): Promise<string | null> {
  if (!db) {
    const { getDb } = await import("./db");
    const activeDb = await getDb();
    const member = await getActingMember(activeDb, customHeaders);
    return member?.id ?? null;
  }
  const member = await getActingMember(db, customHeaders);
  return member?.id ?? null;
}

export async function requireActingMember(
  db: DbClient,
  customHeaders?: Headers
): Promise<MemberRef> {
  const result = await getActingSession(db, customHeaders);

  if (result.status === "unauthenticated") {
    redirect("/inloggen");
  }

  if (result.status === "no_membership") {
    redirect("/geen-toegang");
  }

  if (!result.member) {
    redirect("/inloggen");
  }

  return result.member;
}
