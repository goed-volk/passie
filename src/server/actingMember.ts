import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";
import type { MemberRef } from "./snapshot";

export const COOKIE_NAME = "passie_member";

export async function getActingMemberId(): Promise<string | null> {
  const cookieStore = await cookies();
  const memberCookie = cookieStore.get(COOKIE_NAME);
  return memberCookie?.value ?? null;
}

export async function getActingMember(db: DbClient): Promise<MemberRef | null> {
  const memberId = await getActingMemberId();
  if (!memberId) {
    return null;
  }

  const member = await db.query.members.findFirst({
    where: eq(schema.members.id, memberId),
  });

  if (!member || !member.isActive) {
    return null;
  }

  return {
    id: member.id,
    displayName: member.displayName,
    initials: member.initials,
    avatarColor: member.avatarColor,
    slug: member.slug,
  };
}

export async function requireActingMember(db: DbClient): Promise<MemberRef> {
  const member = await getActingMember(db);
  if (!member) {
    try {
      const cookieStore = await cookies();
      cookieStore.delete(COOKIE_NAME);
    } catch {
      // Ignore if cookie modification is not permitted in current context
    }
    redirect("/wie-ben-jij");
  }
  return member;
}
