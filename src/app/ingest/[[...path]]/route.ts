import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_PATH_PREFIXES = [
  "e",
  "i/v0/e",
  "decide",
  "array",
  "flags",
  "s",
  "batch",
];

const ALLOWED_REQUEST_HEADERS = [
  "content-type",
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
  const { path } = await props.params;
  const targetPath = path ? path.join("/") : "";

  if (!isAllowedPath(targetPath)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const url = new URL(`https://eu.i.posthog.com/${targetPath}`);
  url.search = request.nextUrl.search;

  try {
    const upstreamRes = await fetch(url.toString(), {
      method: "GET",
      headers: buildUpstreamHeaders(request),
    });

    const responseBody = await upstreamRes.text();

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

  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload Too Large" },
      { status: 413 }
    );
  }

  const url = new URL(`https://eu.i.posthog.com/${targetPath}`);
  url.search = request.nextUrl.search;

  try {
    const upstreamRes = await fetch(url.toString(), {
      method: "POST",
      headers: buildUpstreamHeaders(request),
      body,
    });

    const responseBody = await upstreamRes.text();

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
