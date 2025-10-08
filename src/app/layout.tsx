import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Widget Dashboard - Modular System",
  description: "A modular, drag-and-drop widget dashboard built with Next.js and TypeScript",
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
