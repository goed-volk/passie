"use client";

import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { t } from "@/i18n/t";

export function ThemeToggle({
  variant = "icon",
  className,
}: {
  variant?: "icon" | "card";
  className?: string;
}) {
  const { theme, toggleTheme, setTheme } = useTheme();

  if (variant === "card") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTheme("red-black")}
            className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-3 min-h-[96px] ${
              theme === "red-black"
                ? "border-red-600 bg-red-50/40 ring-2 ring-red-600 dark:bg-red-950/20"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-1.5">
                <span className="h-4 w-4 rounded-full bg-[#E2001A] border border-black/10 inline-block shadow-xs" />
                <span className="h-4 w-4 rounded-full bg-[#000000] border border-white/20 inline-block shadow-xs" />
              </div>
              <Sun className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {t("themeRedBlack")}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t("themeRedBlackDesc")}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme("black-red")}
            className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-3 min-h-[96px] ${
              theme === "black-red"
                ? "border-red-500 bg-slate-900 ring-2 ring-red-500 dark:bg-slate-900"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-1.5">
                <span className="h-4 w-4 rounded-full bg-[#000000] border border-white/20 inline-block shadow-xs" />
                <span className="h-4 w-4 rounded-full bg-[#E2001A] border border-black/10 inline-block shadow-xs" />
              </div>
              <Moon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {t("themeBlackRed")}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t("themeBlackRedDesc")}
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={`rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${className || ""}`}
      title={theme === "red-black" ? t("themeBlackRed") : t("themeRedBlack")}
      aria-label={theme === "red-black" ? t("themeBlackRed") : t("themeRedBlack")}
    >
      {theme === "red-black" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </Button>
  );
}
