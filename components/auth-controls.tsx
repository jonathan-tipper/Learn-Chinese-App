"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function AuthControls() {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function onSignOut() {
    const error = await signOut();
    if (error) return;
    router.push("/login");
  }

  if (loading) {
    return <p>Auth: checking...</p>;
  }

  if (!user) {
    const next = pathname && pathname !== "/login" ? `?next=${encodeURIComponent(pathname)}` : "";
    return <Link href={`/login${next}`}>Log in</Link>;
  }

  return (
    <div className="row">
      <span>{user.email ?? "Signed in"}</span>
      <button type="button" onClick={onSignOut}>Sign out</button>
    </div>
  );
}
