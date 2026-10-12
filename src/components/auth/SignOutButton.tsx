"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { t } from "@/i18n/t";

export function SignOutButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await authClient.signOut();
      router.push("/inloggen");
      router.refresh();
    } catch (err) {
      console.error("Sign out error:", err);
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleSignOut}
      disabled={loading}
      className={className ?? "w-full border-slate-300 dark:border-slate-700"}
    >
      <LogOut className="w-4 h-4 mr-2" />
      {loading ? t("settingsRevoking") : t("settingsSignOut")}
    </Button>
  );
}
