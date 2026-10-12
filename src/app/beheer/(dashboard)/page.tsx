import React from "react";
import { getDb } from "@/server/db";
import { listAdminMembers, resolveAdminGroup } from "@/server/adminMembers";
import { BeheerDashboardClient } from "./BeheerDashboardClient";

export const dynamic = "force-dynamic";

export default async function BeheerPage() {
  const db = await getDb();
  const group = await resolveAdminGroup(db);
  const members = await listAdminMembers(db, group.id);

  return <BeheerDashboardClient members={members} />;
}
