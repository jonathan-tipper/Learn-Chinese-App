/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
export {};

// ─── Push notification display ────────────────────────────────────────────────

interface PushPayload {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  data?: { url?: string };
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: "Mandarin Coach", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Mandarin Coach", {
      body:  payload.body,
      icon:  payload.icon  ?? "/icons/icon-192.png",
      badge: payload.badge ?? "/icons/icon-192.png",
      data:  payload.data,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url));
      if (existing && "focus" in existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

// SRS grades are queued in IndexedDB by the foreground app and replayed only
// when a current Supabase session is available. The service worker intentionally
// does not persist or replay bearer tokens.
