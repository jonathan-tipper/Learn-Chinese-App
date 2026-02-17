import { headers } from "next/headers";

export function getUserIdFromHeaders(): string {
  const userId = headers().get("x-user-id") ?? "demo-user";
  return userId;
}
