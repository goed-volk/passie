import React from "react";
import { getAdminPrincipal } from "@/server/adminAuth";
import { redirect } from "next/navigation";

export default async function BeheerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const principal = await getAdminPrincipal();
  if (!principal) {
    redirect("/beheer/inloggen");
  }

  return <>{children}</>;
}
