import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE_NAME = "passie_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type AdminAuthMethod = "password" | "access";

export interface AdminPrincipal {
  subject: string; // today "shared"; later a members.id
  method: AdminAuthMethod; // today always "password"
  memberId: string | null; // today null; later the group admin's members.id
}

export type AdminCapability = "members.read" | "members.write";

interface SessionPayload {
  sub: string;
  method: AdminAuthMethod;
  memberId: string | null;
  iat: number;
  exp: number;
}

export async function getAdminPassword(): Promise<string | null> {
  const nodeEnv = process.env.PASSIE_ADMIN_PASSWORD;
  if (nodeEnv && nodeEnv.trim() !== "") {
    return nodeEnv.trim();
  }
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const cfEnv = (env as unknown as Record<string, string | undefined>)?.PASSIE_ADMIN_PASSWORD;
    if (cfEnv && cfEnv.trim() !== "") {
      return cfEnv.trim();
    }
  } catch {
    // Outside Cloudflare runtime / during tests
  }
  return null;
}

export async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBuf = await crypto.subtle.digest("SHA-256", encoder.encode(a));
  const bBuf = await crypto.subtle.digest("SHA-256", encoder.encode(b));
  const aBytes = new Uint8Array(aBuf);
  const bBytes = new Uint8Array(bBuf);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i]! ^ bBytes[i]!;
  }
  return diff === 0;
}

export async function getSessionSigningKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = "passie:admin-session-signing-v1:";
  const derivedKeyBytes = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${salt}${password}`)
  );
  return crypto.subtle.importKey(
    "raw",
    derivedKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToUint8Array(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function createSessionToken(
  principal: AdminPrincipal,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
  const password = await getAdminPassword();
  if (!password) {
    throw new Error("Cannot create session token: admin password is not configured");
  }
  const key = await getSessionSigningKey(password);
  const payload: SessionPayload = {
    sub: principal.subject,
    method: principal.method,
    memberId: principal.memberId,
    iat: nowSeconds,
    exp: nowSeconds + ADMIN_SESSION_TTL_SECONDS,
  };
  const jsonStr = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(jsonStr));
  const dataToSign = new TextEncoder().encode(`v1.${payloadB64}`);
  const sigBuf = await crypto.subtle.sign("HMAC", key, dataToSign);
  const sigHex = uint8ArrayToHex(new Uint8Array(sigBuf));
  return `v1.${payloadB64}.${sigHex}`;
}

export async function verifySessionToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<AdminPrincipal | null> {
  if (!token || typeof token !== "string") {
    return null;
  }
  const password = await getAdminPassword();
  if (!password) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [version, payloadB64, sigHex] = parts;
  if (version !== "v1" || !payloadB64 || !sigHex) {
    return null;
  }

  try {
    const key = await getSessionSigningKey(password);
    const dataToVerify = new TextEncoder().encode(`v1.${payloadB64}`);
    const sigBytes = hexToUint8Array(sigHex);
    if (!sigBytes || sigBytes.length === 0) {
      return null;
    }
    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes as BufferSource, dataToVerify);
    if (!isValid) {
      return null;
    }

    const payloadJsonBytes = base64UrlDecode(payloadB64);
    const payloadStr = new TextDecoder().decode(payloadJsonBytes);
    const payload = JSON.parse(payloadStr) as SessionPayload;

    if (!payload || typeof payload !== "object") {
      return null;
    }
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number" || typeof payload.iat !== "number") {
      return null;
    }
    if (payload.method !== "password" && payload.method !== "access") {
      return null;
    }
    if (nowSeconds > payload.exp) {
      return null;
    }

    return {
      subject: payload.sub,
      method: payload.method,
      memberId: typeof payload.memberId === "string" ? payload.memberId : null,
    };
  } catch {
    return null;
  }
}

export async function getAdminPrincipal(): Promise<AdminPrincipal | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}

export async function requireAdminSession(): Promise<AdminPrincipal> {
  const principal = await getAdminPrincipal();
  if (!principal) {
    redirect("/beheer/inloggen");
  }
  return principal;
}

export async function requireAdminApi(): Promise<{ principal: AdminPrincipal } | Response> {
  const password = await getAdminPassword();
  if (!password) {
    return NextResponse.json(
      { error: "Admin password is not configured on server" },
      { status: 503 }
    );
  }

  const principal = await getAdminPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { principal };
}

export function assertCapability(
  principal: AdminPrincipal,
  capability: AdminCapability
): boolean {
  if (!principal) {
    return false;
  }
  // All authenticated principals have members.read and members.write today.
  // When granular roles or per-member admin identity land, enforce capability rules here.
  if (capability === "members.read" || capability === "members.write") {
    return true;
  }
  return false;
}
