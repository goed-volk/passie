// @ts-ignore OpenNext generates this bundle during build
import openNextHandler from "../.open-next/worker.js";
// @ts-ignore OpenNext named exports
export * from "../.open-next/worker.js";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./server/schema";
import { ingestClubFixtures } from "./server/ingest";
import { enforceHttpsAndSecurityHeaders } from "./server/http/enforceHttps";
import { captureServerException } from "./server/telemetryConfig";

const workerHandler = {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    return enforceHttpsAndSecurityHeaders(request, () =>
      openNextHandler.fetch(request, env, ctx)
    );
  },
  async scheduled(
    event: ScheduledEvent,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const db = drizzle(env.DB, { schema });
          console.log(
            `[cron:ingest] Scheduled trigger fired at ${event.scheduledTime} (cron: ${event.cron})`
          );
          const result = await ingestClubFixtures(db, "excelsior");
          console.log("[cron:ingest] Ingestion completed:", result);
        } catch (error) {
          console.error("[cron:ingest] Scheduled ingestion failed:", error);
          await captureServerException({
            error,
            distinctId: "system_cron",
            env: env as unknown as Record<string, unknown>,
            context: {
              source: "cron_ingest",
              cron: event.cron,
            },
          });
        }
      })()
    );
  },
};

export default workerHandler;
