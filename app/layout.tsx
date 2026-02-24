import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthControls } from "@/components/auth-controls";
import { AuthGate } from "@/components/auth-gate";
import { AuthProvider } from "@/components/auth-provider";
import { SidebarNav, MobileNav, MobileHeader } from "@/components/sidebar-nav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Learn Chinese — Mandarin Coach",
  description: "Agentic, relationship-based Mandarin learning coach powered by AI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased bg-background">
        <AuthProvider>
          {/* Desktop sidebar */}
          <SidebarNav />

          {/* Mobile top header */}
          <MobileHeader />

          {/* Main content area */}
          <div className="lg:pl-56">
            <main className="min-h-screen pb-20 lg:pb-0">
              <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8 lg:py-8">
                <AuthGate>{children}</AuthGate>
              </div>
            </main>
          </div>

          {/* Mobile bottom nav */}
          <MobileNav />
        </AuthProvider>
      </body>
    </html>
  );
}
