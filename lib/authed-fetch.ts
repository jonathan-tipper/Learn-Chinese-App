import { getBrowserAccessToken } from "@/lib/suite-auth";

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof window !== "undefined") {
    const destination = input instanceof Request ? input.url : String(input);
    if (new URL(destination, window.location.origin).origin !== window.location.origin) {
      throw new Error("Authenticated requests must stay on this app.");
    }
  }
  const token = await getBrowserAccessToken();

  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers
  });
}
