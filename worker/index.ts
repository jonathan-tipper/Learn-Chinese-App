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

// ─── Background Sync — SRS grade queue ───────────────────────────────────────

const DB_NAME    = "learn-chinese-sync";
const DB_VERSION = 1;
const STORE_NAME = "srs-grade-queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

interface QueuedGrade {
  cardId: string;
  grade:  string;
  token:  string;
}

async function drainQueue(): Promise<void> {
  const db    = await openDb();
  const tx    = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const items = await new Promise<Array<{ key: IDBValidKey; value: QueuedGrade }>>((resolve, reject) => {
    const results: Array<{ key: IDBValidKey; value: QueuedGrade }> = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        results.push({ key: cursor.key, value: cursor.value as QueuedGrade });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });

  for (const { key, value } of items) {
    try {
      const res = await fetch("/api/srs/grade", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${value.token}`,
        },
        body: JSON.stringify({ cardId: value.cardId, grade: value.grade }),
      });
      if (res.ok) {
        store.delete(key);
      }
    } catch {
      // Still offline — stop here; sync will retry when connectivity returns
      break;
    }
  }
}

// SyncEvent is not in the standard WebWorker TS lib — cast to access .tag / .waitUntil
interface SyncEvent extends Event {
  tag: string;
  waitUntil(promise: Promise<unknown>): void;
}

self.addEventListener("sync", (event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag === "srs-grade-sync") {
    syncEvent.waitUntil(drainQueue());
  }
});
