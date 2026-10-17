import { describe, it, expect, vi } from "vitest";
import {
  escapeHtml,
  renderOtpEmail,
  renderWelcomeEmail,
  renderPassieEmailLayout,
  resolvePublicOrigin,
  dispatchTransactionalEmail,
} from "../email";

describe("email template system & dispatcher", () => {
  it("escapeHtml escapes dangerous HTML characters", () => {
    expect(escapeHtml(`<script>alert("xss" & 'test')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;test&#39;)&lt;/script&gt;"
    );
  });

  it("renderOtpEmail produces valid Dutch subject, plain text, and dark-mode aware HTML", () => {
    const payload = renderOtpEmail("lid@goedvolk.org", "849201");
    expect(payload.to).toBe("lid@goedvolk.org");
    expect(payload.subject).toBe("Inloggen bij Passie");
    expect(payload.text).toContain("849201");
    expect(payload.text).toContain("Deze code is 10 minuten geldig");
    expect(payload.html).toContain("849201");
    expect(payload.html).toContain("prefers-color-scheme: dark");
    expect(payload.html).toContain("#0B0F19");
    expect(payload.html).toContain("#131B2E");
    expect(payload.html).toContain("#232F46");
    expect(payload.html).toContain("Passie · Seizoenkaarten delen met vrienden");
  });

  it("renderWelcomeEmail renders Dutch welcome copy, /inloggen CTA, and escapes untrusted names", () => {
    const payload = renderWelcomeEmail({
      to: "nieuw@goedvolk.org",
      displayName: `Sam <script>evil()</script>`,
      groupName: `Goedvolk & "Vrienden"`,
      baseUrl: "https://passie.goedvolk.org/",
    });

    expect(payload.to).toBe("nieuw@goedvolk.org");
    expect(payload.subject).toBe(`Je bent toegevoegd aan Passie (Goedvolk & "Vrienden")`);
    expect(payload.text).toContain("Hoi Sam <script>evil()</script>,");
    expect(payload.text).toContain("https://passie.goedvolk.org/inloggen");
    expect(payload.text).toContain("Zo log je in:");
    expect(payload.text).toContain("passkey");

    // HTML checks
    expect(payload.html).toContain("Welkom bij Passie");
    expect(payload.html).toContain("Hoi Sam &lt;script&gt;evil()&lt;/script&gt;,");
    expect(payload.html).not.toContain("<script>evil()</script>");
    expect(payload.html).toContain("Goedvolk &amp; &quot;Vrienden&quot;");
    expect(payload.html).toContain('href="https://passie.goedvolk.org/inloggen"');
    expect(payload.html).toContain("Naar Passie");
  });

  it("renderPassieEmailLayout renders optional fields cleanly", () => {
    const html = renderPassieEmailLayout({
      subject: "Test Onderwerp",
      preheader: "Test Preheader",
      title: "Titel",
      leadText: "Inleiding",
    });
    expect(html).toContain("Test Onderwerp");
    expect(html).toContain("Test Preheader");
    expect(html).toContain("Titel");
    expect(html).toContain("Inleiding");
  });

  it("resolvePublicOrigin normalizes trailing slashes and respects env overrides", () => {
    expect(resolvePublicOrigin({ PASSIE_PUBLIC_ORIGIN: "https://custom.example.org///" })).toBe(
      "https://custom.example.org"
    );
    expect(resolvePublicOrigin({})).toBe("https://passie.goedvolk.org");
  });

  it("dispatchTransactionalEmail scrubs PII keys from extraProperties and supports waitUntil", async () => {
    const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = global.fetch;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const urlStr =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes("/capture/")) {
        fetchCalls.push({
          url: urlStr,
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        });
        return new Response(JSON.stringify({ status: 1 }), { status: 200 });
      }
      return originalFetch(input as RequestInfo, init);
    });

    try {
      const waitUntilPromises: Promise<unknown>[] = [];
      const payload = renderWelcomeEmail({
        to: "secret-member@goedvolk.org",
        displayName: "Geheime Naam",
        groupName: "Goedvolk",
      });

      await dispatchTransactionalEmail({
        payload,
        kind: "welcome",
        trigger: "member_created",
        memberId: "member_goedvolk_geheim",
        env: {
          PASSIE_ENV: "development",
          POSTHOG_KEY: "phc_test_dispatch",
          POSTHOG_HOST: "https://eu.i.posthog.com",
        },
        cfCtx: {
          ctx: {
            waitUntil: (p) => waitUntilPromises.push(p),
          },
        },
        extraProperties: {
          to: "secret-member@goedvolk.org",
          email: "secret-member@goedvolk.org",
          name: "Geheime Naam",
          displayName: "Geheime Naam",
          otp: "999999",
          safe_custom_flag: true,
        },
      });

      while (waitUntilPromises.length > 0) {
        await Promise.all(waitUntilPromises.splice(0));
      }

      expect(fetchCalls.length).toBe(1);
      const eventBody = fetchCalls[0]!.body;
      expect(eventBody.event).toBe("email.sent");
      expect(eventBody.distinct_id).toBe("member_goedvolk_geheim");
      const props = eventBody.properties as Record<string, unknown>;
      expect(props.kind).toBe("welcome");
      expect(props.trigger).toBe("member_created");
      expect(props.provider).toBe("console");
      expect(props.$geoip_disable).toBe(true);
      expect(props.$process_person_profile).toBe(true);
      expect(props.safe_custom_flag).toBe(true);

      // Verify PII was strictly scrubbed
      expect(props.to).toBeUndefined();
      expect(props.email).toBeUndefined();
      expect(props.name).toBeUndefined();
      expect(props.displayName).toBeUndefined();
      expect(props.otp).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
