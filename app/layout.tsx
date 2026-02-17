import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = {
  title: "Learn Chinese Coach",
  description: "Agentic, relationship-based Mandarin learning coach"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <h1>Learn Chinese v0.1</h1>
          <nav>
            <Link href="/">Home</Link>
            <Link href="/onboarding">Onboarding</Link>
            <Link href="/chat">Chat</Link>
            <Link href="/review">Review</Link>
            <Link href="/memory">Memory</Link>
            <Link href="/progress">Progress</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
