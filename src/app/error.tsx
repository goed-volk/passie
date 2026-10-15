"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackClientException } from "@/lib/posthog";
import { t } from "@/i18n/t";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    trackClientException(error, {
      boundary: "app_error_boundary",
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-[80dvh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-lg">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {t("errorBoundaryTitle")}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("errorBoundaryDesc")}
          </p>
        </div>
        <Button
          onClick={() => reset()}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          {t("errorBoundaryRetry")}
        </Button>
      </div>
    </div>
  );
}
