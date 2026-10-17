export const HSTS_HEADER_VALUE =
  "max-age=31536000; includeSubDomains; preload";

export function isLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower === "[::1]" ||
    lower.endsWith(".local")
  );
}

export async function enforceHttpsAndSecurityHeaders(
  request: Request,
  handleFetch: () => Promise<Response>
): Promise<Response> {
  const url = new URL(request.url);

  if (!isLocalHostname(url.hostname)) {
    const forwardedProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();

    const isHttp =
      forwardedProto === "http" ||
      (!forwardedProto && url.protocol === "http:");

    if (isHttp) {
      const httpsUrl = new URL(url.toString());
      httpsUrl.protocol = "https:";

      return new Response(null, {
        status: 301,
        headers: {
          Location: httpsUrl.toString(),
          "Strict-Transport-Security": HSTS_HEADER_VALUE,
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
      });
    }
  }

  const response = await handleFetch();

  if (isLocalHostname(url.hostname)) {
    return response;
  }

  const mutableResponse = new Response(response.body, response);
  if (!mutableResponse.headers.has("Strict-Transport-Security")) {
    mutableResponse.headers.set("Strict-Transport-Security", HSTS_HEADER_VALUE);
  }
  if (!mutableResponse.headers.has("X-Content-Type-Options")) {
    mutableResponse.headers.set("X-Content-Type-Options", "nosniff");
  }
  if (!mutableResponse.headers.has("Referrer-Policy")) {
    mutableResponse.headers.set(
      "Referrer-Policy",
      "strict-origin-when-cross-origin"
    );
  }

  return mutableResponse;
}
