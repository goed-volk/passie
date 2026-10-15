"use client";

import { useEffect } from "react";
import { trackClientException } from "@/lib/posthog";
import { t } from "@/i18n/t";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    trackClientException(error, {
      boundary: "global_error_boundary",
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="nl">
      <body className="antialiased bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 min-h-[100dvh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-lg">
          <h2 className="text-lg font-bold">{t("errorBoundaryTitle")}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("errorBoundaryDesc")}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl"
          >
            {t("errorBoundaryRetry")}
          </button>
        </div>
      </body>
    </html>
  );
}
