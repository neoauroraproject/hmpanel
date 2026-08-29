import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PANEL_METADATA } from "@/lib/panel-brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Root metadata — admin/portal layouts may override title; icons apply site-wide. */
export const metadata: Metadata = {
  title: {
    default: "HM Panel",
    template: "%s | HM Panel",
  },
  icons: PANEL_METADATA.icons,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${geistSans.variable} ${geistMono.variable} locale-fa h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="stylesheet" href="/fonts/vazirmatn/vazirmatn.css" />
      </head>
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
