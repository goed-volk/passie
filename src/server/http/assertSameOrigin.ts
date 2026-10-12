export class CrossOriginRequestError extends Error {
  constructor(message = "Cross-origin request rejected") {
    super(message);
    this.name = "CrossOriginRequestError";
  }
}

function isAllowedDevOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
      (parsed.protocol === "http:" || parsed.protocol === "https:")
    );
  } catch {
    return false;
  }
}

export function isSameOrigin(request: Request): boolean {
  const secFetchSite = request.headers.get("Sec-Fetch-Site");
  if (secFetchSite === "cross-site") {
    return false;
  }

  const origin = request.headers.get("Origin");
  if (!origin) {
    // Non-browser or same-origin requests without Origin header are permitted
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host");

    if (!hostHeader) {
      // Fallback: compare against request.url origin
      const reqUrl = new URL(request.url);
      if (reqUrl.origin === originUrl.origin || isAllowedDevOrigin(origin)) {
        return true;
      }
      return false;
    }

    const hostOnly = (hostHeader.split(":")[0] ?? "").toLowerCase();
    const originHost = originUrl.hostname.toLowerCase();

    if (hostOnly === originHost || isAllowedDevOrigin(origin)) {
      return true;
    }

    // Allow configured production domain
    if (originUrl.hostname === "passie.goedvolk.org" && hostOnly === "passie.goedvolk.org") {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function assertSameOrigin(request: Request): void {
  if (!isSameOrigin(request)) {
    throw new CrossOriginRequestError("Cross-origin request rejected");
  }
}
