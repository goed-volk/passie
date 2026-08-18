import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://passie.goedvolk.org"),
  title: {
    default: "Passie — Seizoenkaarten delen met je vriendengroep",
    template: "%s · Passie",
  },
  description: "Eerlijk, snel en overzichtelijk seizoenkaarten verdelen en fysieke pasjes bijhouden binnen je vriendengroep.",
  applicationName: "Passie",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    type: "website",
    locale: "nl_NL",
    url: "https://passie.goedvolk.org",
    siteName: "Passie",
    title: "Passie — Seizoenkaarten delen met je vriendengroep",
    description: "Eerlijk, snel en overzichtelijk seizoenkaarten verdelen en fysieke pasjes bijhouden binnen je vriendengroep.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Passie — Seizoenkaarten delen met je vriendengroep",
    description: "Eerlijk, snel en overzichtelijk seizoenkaarten verdelen en fysieke pasjes bijhouden binnen je vriendengroep.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#E2001A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("passie_theme")?.value;
  const isDark = themeCookie === "black-red";
  const initialTheme = themeCookie === "black-red" || themeCookie === "red-black" ? themeCookie : undefined;

  return (
    <html
      lang="nl"
      className={isDark ? "dark" : ""}
      data-theme={initialTheme || "red-black"}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var cookieMatch = document.cookie.match(/passie_theme=([^;]+)/);
                var theme = cookieMatch ? cookieMatch[1] : localStorage.getItem('passie_theme');
                if (!theme) {
                  theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'black-red' : 'red-black';
                }
                if (theme === 'black-red') {
                  document.documentElement.classList.add('dark');
                  document.documentElement.setAttribute('data-theme', 'black-red');
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.setAttribute('data-theme', 'red-black');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="antialiased bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 min-h-[100dvh]">
        <Providers initialTheme={initialTheme}>{children}</Providers>
      </body>
    </html>
  );
}
