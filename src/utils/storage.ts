import type { EditOperation } from "../types/editor";

const DB_NAME = "akki-pdf-editor";
const STORE = "sessions";
const VERSION = 1;

export type SavedSession = {
  id: string;
  name: string;
  updatedAt: number;
  bytes: Uint8Array;
  operations: EditOperation[];
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

export async function saveSession(session: SavedSession) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getLatestSession(): Promise<SavedSession | undefined> {
  const db = await openDb();
  const sessions = await new Promise<SavedSession[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
