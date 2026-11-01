import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
