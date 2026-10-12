import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { getActingSession } from "@/server/actingMember";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default async function InloggenPage() {
  const db = await getDb();
  const sessionResult = await getActingSession(db);

  if (sessionResult.status === "active") {
    redirect("/");
  }

  if (sessionResult.status === "no_membership") {
    redirect("/geen-toegang");
  }

  return (
    <main className="min-h-[100dvh] flex flex-col justify-center items-center py-10 px-4 bg-slate-50 dark:bg-[#0B0F19]">
      <LoginForm />
    </main>
  );
}
