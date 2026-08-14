import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Fundraises — Private Market Fundraising Signals",
  description:
    "Discover companies raising capital from SEC Form D filings. Track amendments, filter by sector, and export ranked contacts — open source.",
  openGraph: {
    title: "Fundraises — Private Market Fundraising Signals",
    description:
      "2,700+ SEC Form D filings, amendment tracking, and ranked fundraising contacts in one open-source dashboard.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fundraises — Private Market Fundraising Signals",
    description:
      "2,700+ SEC Form D filings, amendment tracking, and ranked fundraising contacts in one open-source dashboard.",
  },
};

// Set theme before paint to avoid a flash of the wrong mode.
const themeScript = `
try {
  const stored = localStorage.getItem("fundraises-theme");
  const dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script
          id="fundraises-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        {children}
      </body>
    </html>
  );
}
