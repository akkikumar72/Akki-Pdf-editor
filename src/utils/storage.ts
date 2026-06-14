import type { EditOperation } from "../types/editor";
import type { EditState } from "../state/editModel";

const DB_NAME = "akki-pdf-editor";
const STORE = "sessions";
const VERSION = 1;

export type SavedSession = {
  id: string;
  name: string;
  updatedAt: number;
  bytes: Uint8Array;
  pageIndex?: number;
  scale?: number;
  rotation?: number;
  editState?: Pick<EditState, "operations" | "past" | "future">;
  operations?: EditOperation[];
};

export type SessionSummary = {
  id: string;
  name: string;
  updatedAt: number;
  operationCount: number;
  pageIndex?: number;
};

export type SessionSaveInput = {
  id: string;
  name: string;
  updatedAt: number;
  bytes: Uint8Array;
  pageIndex?: number;
  scale?: number;
  rotation?: number;
  editState: Pick<EditState, "operations" | "past" | "future">;
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

export async function saveSession(session: SessionSaveInput) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listSessions(): Promise<SessionSummary[]> {
  const db = await openDb();
  const sessions = await new Promise<SavedSession[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return sessions
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) => ({
      id: session.id,
      name: session.name,
      updatedAt: session.updatedAt,
      operationCount: session.editState?.operations.length ?? session.operations?.length ?? 0,
      pageIndex: session.pageIndex,
    }));
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

export async function getSession(id: string): Promise<SavedSession | undefined> {
  const db = await openDb();
  const session = await new Promise<SavedSession | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return session;
}

export async function deleteSession(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearSessions() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
