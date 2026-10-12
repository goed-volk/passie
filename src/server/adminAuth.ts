import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getDb, type DbClient } from "./db";
import { getActingSession } from "./actingMember";

export interface AdminPrincipal {
  subject: string;
  memberId: string | null;
  email: string;
  role: "platform_admin" | "group_admin";
}

export type AdminCapability = "members.read" | "members.write";

export async function getAdminPrincipal(
  customDb?: DbClient,
  customHeaders?: Headers
): Promise<AdminPrincipal | null> {
  const db = customDb ?? (await getDb());
  const sessionResult = await getActingSession(db, customHeaders);

  if (sessionResult.status === "unauthenticated" || !sessionResult.user) {
    return null;
  }

  const isPlatformAdmin = sessionResult.user.role === "admin";
  const isGroupAdmin = sessionResult.member?.role === "admin";

  if (!isPlatformAdmin && !isGroupAdmin) {
    return null;
  }

  return {
    subject: sessionResult.user.id,
    memberId: sessionResult.member?.id ?? null,
    email: sessionResult.user.email,
    role: isPlatformAdmin ? "platform_admin" : "group_admin",
  };
}

export async function requireAdminSession(
  customDb?: DbClient,
  customHeaders?: Headers
): Promise<AdminPrincipal> {
  const db = customDb ?? (await getDb());
  const sessionResult = await getActingSession(db, customHeaders);

  if (sessionResult.status === "unauthenticated") {
    redirect("/inloggen");
  }

  const isPlatformAdmin = sessionResult.user?.role === "admin";
  const isGroupAdmin = sessionResult.member?.role === "admin";

  if (!isPlatformAdmin && !isGroupAdmin) {
    redirect("/instellingen");
  }

  return {
    subject: sessionResult.user!.id,
    memberId: sessionResult.member?.id ?? null,
    email: sessionResult.user!.email,
    role: isPlatformAdmin ? "platform_admin" : "group_admin",
  };
}

export async function requireAdminApi(
  customDb?: DbClient,
  customHeaders?: Headers
): Promise<{ principal: AdminPrincipal } | Response> {
  const principal = await getAdminPrincipal(customDb, customHeaders);
  if (!principal) {
    return NextResponse.json(
      { error: "Forbidden: administrator privileges required", code: "FORBIDDEN" },
      { status: 403 }
    );
  }
  return { principal };
}

export function assertCapability(
  principal: AdminPrincipal,
  capability: AdminCapability
): boolean {
  if (!principal) return false;
  return capability === "members.read" || capability === "members.write";
}
