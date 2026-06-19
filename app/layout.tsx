import type { Metadata, Viewport } from "next";
import { AuthGate } from "@/components/auth-gate";
import { AuthProvider } from "@/components/auth-provider";
import { SidebarNav, MobileNav, MobileHeader } from "@/components/sidebar-nav";
import { InstallPrompt } from "@/components/install-prompt";
import { NotificationPermission } from "@/components/notification-permission";
import "./globals.css";

export const metadata: Metadata = {
  title: "Learn Chinese — Mandarin Coach",
  description: "Agentic, relationship-based Mandarin learning coach powered by AI",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mandarin Coach",
  },
};

export const viewport: Viewport = {
  themeColor: "#2d7d6a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Inter + Noto Serif SC — loaded via <link> so builds work in offline CI */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Serif+SC:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        {/* PWA */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
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

          {/* PWA install banner */}
          <InstallPrompt />
          {/* Push notification opt-in (shown from 2nd visit, above install banner) */}
          <NotificationPermission />
        </AuthProvider>
      </body>
    </html>
  );
}
