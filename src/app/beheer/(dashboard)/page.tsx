import React from "react";
import { getDb } from "@/server/db";
import { requireAdminSession } from "@/server/adminAuth";
import { listAdminMembers, resolveAdminGroup } from "@/server/adminMembers";
import { BeheerDashboardClient } from "./BeheerDashboardClient";

export const dynamic = "force-dynamic";

export default async function BeheerPage() {
  // S1: Ensure authenticated session & resolve principal
  await requireAdminSession();

  const db = await getDb();
  const group = await resolveAdminGroup(db);
  const members = await listAdminMembers(db, group.id);

  return <BeheerDashboardClient members={members} />;
}
