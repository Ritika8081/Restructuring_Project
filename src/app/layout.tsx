/**
 * src/app/layout.tsx
 *
 * Purpose: Root layout for Next.js app. Wraps the application with global
 * providers including ChannelDataProvider and FlowModalProvider and renders
 * the `Header` component.
 */
import type { Metadata } from "next";
import Header from "@/components/Header";
import "./globals.css";
import { ChannelDataProvider } from '@/lib/channelDataContext';
import { FlowModalProvider } from '@/context/FlowModalContext';

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
    <html lang="en" className="h-full">
      <body className="h-full m-0 p-0 bg-gray-50">
        <ChannelDataProvider>
          <FlowModalProvider>
            <Header />
            <main className="min-h-[calc(100vh-4rem)]">
              {children}
            </main>
          </FlowModalProvider>
        </ChannelDataProvider>
      </body>
    </html>
  );
}