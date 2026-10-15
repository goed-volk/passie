import { type NextRequest, NextResponse } from "next/server";
import { getTelemetryConfig } from "@/server/telemetryConfig";

export const dynamic = "force-dynamic";

const ALLOWED_PATH_PREFIXES = [
  "e",
  "i/v0/e",
  "decide",
  "array",
  "flags",
  "s",
  "batch",
  "static",
];

const ALLOWED_REQUEST_HEADERS = [
  "content-type",
  "content-encoding",
  "user-agent",
  "accept",
  "accept-encoding",
];

const MAX_BODY_BYTES = 64 * 1024; // 64 KB

function isAllowedPath(targetPath: string): boolean {
  if (!targetPath) return false;
  return ALLOWED_PATH_PREFIXES.some(
    (prefix) =>
      targetPath === prefix ||
      targetPath.startsWith(`${prefix}/`) ||
      targetPath.startsWith(`${prefix}?`)
  );
}

function buildUpstreamHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const name of ALLOWED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  const clientIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (clientIp) {
    headers.set("x-forwarded-for", clientIp);
  }
  return headers;
}

function buildDownstreamHeaders(upstreamRes: Response): Headers {
  const headers = new Headers();
  const contentType = upstreamRes.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  const cacheControl = upstreamRes.headers.get("cache-control");
  if (cacheControl) {
    headers.set("cache-control", cacheControl);
  }
  return headers;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ path?: string[] }> }
) {
  const { posthogKey, posthogHost } = await getTelemetryConfig();
  if (!posthogKey) {
    return NextResponse.json({ error: "Telemetry disabled" }, { status: 404 });
  }

  const { path } = await props.params;
  const targetPath = path ? path.join("/") : "";

  if (!isAllowedPath(targetPath)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const url = new URL(`${posthogHost}/${targetPath}`);
  url.search = request.nextUrl.search;

  try {
    const upstreamRes = await fetch(url.toString(), {
      method: "GET",
      headers: buildUpstreamHeaders(request),
    });

    const responseBody = await upstreamRes.arrayBuffer();

    return new NextResponse(responseBody, {
      status: upstreamRes.status,
      headers: buildDownstreamHeaders(upstreamRes),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "PostHog proxy error", message: String(err) },
      { status: 502 }
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ path?: string[] }> }
) {
  const { posthogKey, posthogHost } = await getTelemetryConfig();
  if (!posthogKey) {
    return NextResponse.json({ error: "Telemetry disabled" }, { status: 404 });
  }

  const { path } = await props.params;
  const targetPath = path ? path.join("/") : "";

  if (!isAllowedPath(targetPath)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload Too Large" },
      { status: 413 }
    );
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload Too Large" },
      { status: 413 }
    );
  }

  const url = new URL(`${posthogHost}/${targetPath}`);
  url.search = request.nextUrl.search;

  try {
    const upstreamRes = await fetch(url.toString(), {
      method: "POST",
      headers: buildUpstreamHeaders(request),
      body,
    });

    const responseBody = await upstreamRes.arrayBuffer();

    return new NextResponse(responseBody, {
      status: upstreamRes.status,
      headers: buildDownstreamHeaders(upstreamRes),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "PostHog proxy error", message: String(err) },
      { status: 502 }
    );
  }
}
