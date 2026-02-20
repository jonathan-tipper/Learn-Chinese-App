import type { Metadata } from "next";
import Link from "next/link";
import { AuthControls } from "@/components/auth-controls";
import { AuthGate } from "@/components/auth-gate";
import { AuthProvider } from "@/components/auth-provider";
import "./styles.css";

export const metadata: Metadata = {
  title: "Learn Chinese Coach",
  description: "Agentic, relationship-based Mandarin learning coach"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <header className="header">
            <h1>Learn Chinese v0.1</h1>
            <nav>
              <Link href="/">Home</Link>
              <Link href="/onboarding">Onboarding</Link>
              <Link href="/chat">Chat</Link>
              <Link href="/review">Review</Link>
              <Link href="/memory">Memory</Link>
              <Link href="/progress">Progress</Link>
              <Link href="/login">Login</Link>
            </nav>
            <AuthControls />
          </header>
          <main className="container">
            <AuthGate>{children}</AuthGate>
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
