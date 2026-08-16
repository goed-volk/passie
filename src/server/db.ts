import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export async function getDb(d1?: D1Database) {
  if (d1) {
    return createDb(d1);
  }
  const { env } = await getCloudflareContext({ async: true });
  return createDb(env.DB);
}

export type DbClient = ReturnType<typeof createDb>;
