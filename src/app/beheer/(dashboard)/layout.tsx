import React from "react";
import { requireAdminSession } from "@/server/adminAuth";

export default async function BeheerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSession();
  return <>{children}</>;
}
