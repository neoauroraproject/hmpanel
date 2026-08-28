import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Root metadata is intentionally minimal — admin panel and storefront set their own title/icons. */
export const metadata: Metadata = {
  title: {
    default: "HM Panel",
    template: "%s | HM Panel",
  },
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
