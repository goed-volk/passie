import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  constantTimeEquals,
  createSessionToken,
  getAdminPassword,
  getAdminPrincipal,
  requireAdminApi,
  requireAdminSession,
  verifySessionToken,
  type AdminPrincipal,
} from "../adminAuth";

// Mock next/headers
const mockGetCookie = vi.fn();
const mockDeleteCookie = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockGetCookie,
    delete: mockDeleteCookie,
  }),
}));

// Mock next/navigation
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

describe("adminAuth", () => {
  const originalEnv = process.env.PASSIE_ADMIN_PASSWORD;

  beforeEach(() => {
    mockGetCookie.mockReset();
    mockDeleteCookie.mockReset();
    mockRedirect.mockReset();
    process.env.PASSIE_ADMIN_PASSWORD = "test-secret-password-123";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PASSIE_ADMIN_PASSWORD = originalEnv;
    } else {
      delete process.env.PASSIE_ADMIN_PASSWORD;
    }
  });

  describe("getAdminPassword & constantTimeEquals", () => {
    it("returns null when password is unset or empty", async () => {
      delete process.env.PASSIE_ADMIN_PASSWORD;
      expect(await getAdminPassword()).toBeNull();

      process.env.PASSIE_ADMIN_PASSWORD = "   ";
      expect(await getAdminPassword()).toBeNull();
    });

    it("verifies matching and non-matching passwords with constantTimeEquals", async () => {
      expect(await constantTimeEquals("test-secret-password-123", "test-secret-password-123")).toBe(true);
      expect(await constantTimeEquals("test-secret-password-123", "wrong-password")).toBe(false);
      expect(await constantTimeEquals("short", "longer-password")).toBe(false);
    });
  });

  describe("createSessionToken & verifySessionToken", () => {
    const principal: AdminPrincipal = {
      subject: "shared",
      method: "password",
      memberId: null,
    };

    it("creates a valid v1 structured session token and verifies it", async () => {
      const token = await createSessionToken(principal);
      expect(token.startsWith("v1.")).toBe(true);

      const verified = await verifySessionToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.subject).toBe("shared");
      expect(verified?.method).toBe("password");
      expect(verified?.memberId).toBeNull();
    });

    it("rejects token with unknown version prefix", async () => {
      const token = await createSessionToken(principal);
      const invalidVersionToken = token.replace(/^v1\./, "v2.");
      expect(await verifySessionToken(invalidVersionToken)).toBeNull();
    });

    it("rejects token with tampered signature", async () => {
      const token = await createSessionToken(principal);
      const parts = token.split(".");
      const tampered = `${parts[0]}.${parts[1]}.${parts[2]?.slice(0, -2)}00`;
      expect(await verifySessionToken(tampered)).toBeNull();
    });

    it("rejects expired token", async () => {
      const now = Math.floor(Date.now() / 1000);
      const pastNow = now - (ADMIN_SESSION_TTL_SECONDS + 100);
      const token = await createSessionToken(principal, pastNow);
      expect(await verifySessionToken(token, now)).toBeNull();
    });

    it("rejects token minted under an old/different password", async () => {
      process.env.PASSIE_ADMIN_PASSWORD = "original-password";
      const token = await createSessionToken(principal);

      // Rotate password
      process.env.PASSIE_ADMIN_PASSWORD = "new-rotated-password";
      expect(await verifySessionToken(token)).toBeNull();
    });
  });

  describe("getAdminPrincipal & requireAdminSession", () => {
    it("returns null when session cookie is absent", async () => {
      mockGetCookie.mockReturnValue(undefined);
      expect(await getAdminPrincipal()).toBeNull();
    });

    it("returns principal when session cookie is valid", async () => {
      const principal: AdminPrincipal = {
        subject: "shared",
        method: "password",
        memberId: null,
      };
      const token = await createSessionToken(principal);
      mockGetCookie.mockImplementation((name: string) => {
        if (name === ADMIN_COOKIE_NAME) {
          return { name: ADMIN_COOKIE_NAME, value: token };
        }
        return undefined;
      });

      const res = await getAdminPrincipal();
      expect(res).not.toBeNull();
      expect(res?.subject).toBe("shared");

      const required = await requireAdminSession();
      expect(required.subject).toBe("shared");
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("redirects to /beheer/inloggen when requireAdminSession fails", async () => {
      mockGetCookie.mockReturnValue(undefined);
      await expect(requireAdminSession()).rejects.toThrow("NEXT_REDIRECT:/beheer/inloggen");
      expect(mockRedirect).toHaveBeenCalledWith("/beheer/inloggen");
    });
  });

  describe("requireAdminApi", () => {
    it("returns 503 response when PASSIE_ADMIN_PASSWORD is unset", async () => {
      delete process.env.PASSIE_ADMIN_PASSWORD;
      const res = await requireAdminApi();
      expect(res instanceof Response).toBe(true);
      if (res instanceof Response) {
        expect(res.status).toBe(503);
      }
    });

    it("returns 401 response when session cookie is invalid or absent", async () => {
      mockGetCookie.mockReturnValue(undefined);
      const res = await requireAdminApi();
      expect(res instanceof Response).toBe(true);
      if (res instanceof Response) {
        expect(res.status).toBe(401);
      }
    });

    it("returns principal object when authenticated", async () => {
      const principal: AdminPrincipal = {
        subject: "shared",
        method: "password",
        memberId: null,
      };
      const token = await createSessionToken(principal);
      mockGetCookie.mockImplementation((name: string) => {
        if (name === ADMIN_COOKIE_NAME) {
          return { name: ADMIN_COOKIE_NAME, value: token };
        }
        return undefined;
      });

      const res = await requireAdminApi();
      expect("principal" in res).toBe(true);
      if ("principal" in res) {
        expect(res.principal.subject).toBe("shared");
      }
    });
  });
});
