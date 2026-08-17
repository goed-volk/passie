import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Passie",
  description: "Seizoenkaarten delen met je vrienden",
  manifest: "/manifest.webmanifest",
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
  const initialTheme = isDark ? "black-red" : "red-black";

  return (
    <html lang="nl" className={isDark ? "dark" : ""} data-theme={initialTheme} suppressHydrationWarning>
      <body className="antialiased bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 min-h-[100dvh]">
        <Providers initialTheme={initialTheme}>{children}</Providers>
      </body>
    </html>
  );
}
