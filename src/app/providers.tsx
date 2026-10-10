"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { initPostHog, type ClientTelemetryConfig } from "@/lib/posthog";
import { ThemeProvider, type Theme } from "@/components/ThemeProvider";

export function Providers({
  children,
  initialTheme,
  telemetryConfig,
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
  telemetryConfig?: ClientTelemetryConfig;
}) {
  useEffect(() => {
    initPostHog(telemetryConfig);
  }, [telemetryConfig]);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2000,
            refetchOnWindowFocus: true,
          },
        },
      })
  );

  return (
    <ThemeProvider initialTheme={initialTheme}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
