import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fliptrack | Resale tracker and bid guide",
  description: "A simple inventory, profit, and Whatnot bid guide for reselling.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
