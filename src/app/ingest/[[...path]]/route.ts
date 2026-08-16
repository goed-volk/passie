import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await props.params;
  const targetPath = path ? path.join("/") : "";
  const host = "https://eu.i.posthog.com";
  const url = `${host}/${targetPath}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("host", "eu.i.posthog.com");

  try {
    const body = await request.text();
    const res = await fetch(url, {
      method: "POST",
      headers: requestHeaders,
      body,
    });

    return new NextResponse(res.body, {
      status: res.status,
      headers: res.headers,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "PostHog proxy error", message: String(err) },
      { status: 500 }
    );
  }
}
