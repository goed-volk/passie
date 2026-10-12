import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

const handler = async (request: Request) => {
  const auth = await getAuth();
  return auth.handler(request);
};

export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(handler);
