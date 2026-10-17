import { describe, it, expect, vi } from "vitest";
import {
  escapeHtml,
  renderOtpEmail,
  renderWelcomeEmail,
  renderPassAssignedEmail,
  renderDeadlineReminderEmail,
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

  it("renderPassAssignedEmail renders self and guest copy, match details, and escapes untrusted strings", () => {
    // 1. Self variant
    const selfPayload = renderPassAssignedEmail({
      to: "sam@goedvolk.org",
      claimantName: "Sam <tag>",
      kind: "self",
      matchLabel: "Excelsior - Feyenoord",
      kickoffFormatted: "zaterdag 17 oktober, 18:45",
      venue: "Van Donge & De Roo Stadion",
      passLabel: "Pas 1",
      seatInfo: "Vak K, Rij 12",
      currentHolderName: "Ilse",
      groupName: "Goedvolk",
      baseUrl: "https://passie.goedvolk.org/",
    });

    expect(selfPayload.to).toBe("sam@goedvolk.org");
    expect(selfPayload.subject).toBe("Je bent erbij! Pas toegewezen voor Excelsior - Feyenoord");
    expect(selfPayload.text).toContain("Hoi Sam <tag>,");
    expect(selfPayload.text).toContain("Je stond op de bank");
    expect(selfPayload.text).toContain("Excelsior - Feyenoord");
    expect(selfPayload.text).toContain("Pas 1 (Vak K, Rij 12)");
    expect(selfPayload.text).toContain("Ilse");
    expect(selfPayload.html).toContain("Je bent erbij!");
    expect(selfPayload.html).toContain("Hoi Sam &lt;tag&gt;,");
    expect(selfPayload.html).toContain("Pas 1 (Vak K, Rij 12)");
    expect(selfPayload.html).toContain("Bekijk wedstrijd in Passie");
    expect(selfPayload.html).not.toContain("<tag>");

    // 2. Guest variant
    const guestPayload = renderPassAssignedEmail({
      to: "sam@goedvolk.org",
      claimantName: "Sam",
      kind: "guest",
      guestName: "Opa Cor",
      matchLabel: "Excelsior - Ajax",
      kickoffFormatted: "zondag 25 oktober, 14:30",
      venue: "Van Donge & De Roo Stadion",
      passLabel: "Pas 2",
      currentHolderName: "Noor",
      groupName: "Goedvolk",
    });

    expect(guestPayload.subject).toBe("Pas toegewezen voor je gast bij Excelsior - Ajax");
    expect(guestPayload.text).toContain("Er is een seizoenkaart vrijgekomen voor je gast (Opa Cor)");
    expect(guestPayload.html).toContain("Je gast is erbij!");
    expect(guestPayload.html).toContain("Opa Cor");
  });

  it("renderDeadlineReminderEmail renders reminder subject, deadline alert, and pass list", () => {
    const payload = renderDeadlineReminderEmail({
      to: "bram@goedvolk.org",
      ownerName: "Bram",
      passLabels: ["Pas 1", "Pas 2"],
      matchLabel: "Excelsior - Sparta",
      kickoffFormatted: "vrijdag 30 oktober, 20:00",
      deadlineFormatted: "woensdag 28 oktober om 20:00",
      groupName: "Goedvolk",
    });

    expect(payload.to).toBe("bram@goedvolk.org");
    expect(payload.subject).toBe("Laat weten of je gaat: Excelsior - Sparta");
    expect(payload.text).toContain("Hoi Bram,");
    expect(payload.text).toContain("Pas 1, Pas 2");
    expect(payload.text).toContain("vóór woensdag 28 oktober om 20:00");
    expect(payload.html).toContain("Ga je naar Excelsior - Sparta?");
    expect(payload.html).toContain("Pas 1, Pas 2");
    expect(payload.html).toContain("woensdag 28 oktober om 20:00");
    expect(payload.html).toContain("Nu aangeven in Passie");
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
