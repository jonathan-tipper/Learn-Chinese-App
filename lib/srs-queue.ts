/**
 * Client-side IndexedDB queue for SRS grades that were submitted while offline.
 *
 * The same DB / store is also drained by the service worker's Background Sync
 * handler (worker/index.ts) so grades replay even when the tab is closed.
 */

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

export interface QueuedGrade {
  cardId: string;
  grade:  string;
}

/** Add one grade to the persistent queue and register a Background Sync tag. */
export async function enqueueGrade(entry: QueuedGrade): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });

  // Do not store bearer tokens in IndexedDB. The foreground online handler drains
  // this queue with the user's current Supabase session.
}

/** Return all queued grades without removing them. */
async function readAll(): Promise<Array<{ key: IDBValidKey; value: QueuedGrade }>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const results: Array<{ key: IDBValidKey; value: QueuedGrade }> = [];
    const tx  = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).openCursor();
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
}

/** Delete a single entry by its IDB key. */
async function deleteEntry(key: IDBValidKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/** How many grades are waiting to be synced. */
export async function getPendingCount(): Promise<number> {
  const items = await readAll();
  return items.length;
}

/**
 * Replay all queued grades against the API.
 * Called from the main thread when the browser comes back online.
 * The SW's Background Sync handler calls its own copy of this logic.
 */
export async function drainQueue(token: string): Promise<number> {
  const items = await readAll();
  let sent = 0;

  for (const { key, value } of items) {
    try {
      const res = await fetch("/api/srs/grade", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({ cardId: value.cardId, grade: value.grade }),
      });
      if (res.ok) {
        await deleteEntry(key);
        sent++;
      }
    } catch {
      // Still offline — stop; will retry on next online event or sync
      break;
    }
  }

  return sent;
}
