import type { EditOperation } from "../types/editor";
import type { EditState } from "../state/editModel";
import { normalizeLegacyOperations } from "../editor/linkTarget";

const DB_NAME = "akki-pdf-editor";
const STORE = "sessions";
const SIGNATURE_STORE = "signatures";
const VERSION = 2;

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

/**
 * Sessions saved before link targets became a kind union stored `{ href }`
 * links. Normalize every operation list (current, undo, redo) on the way out
 * of IndexedDB so old data keeps loading.
 */
function normalizeSession(session: SavedSession | undefined): SavedSession | undefined {
  if (!session) return session;
  return {
    ...session,
    operations: session.operations ? normalizeLegacyOperations(session.operations) : session.operations,
    editState: session.editState
      ? {
          operations: normalizeLegacyOperations(session.editState.operations),
          past: session.editState.past.map((entry) => ({ ...entry, operations: normalizeLegacyOperations(entry.operations) })),
          future: session.editState.future.map((entry) => ({ ...entry, operations: normalizeLegacyOperations(entry.operations) })),
        }
      : session.editState,
  };
}

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
      if (!db.objectStoreNames.contains(SIGNATURE_STORE)) {
        db.createObjectStore(SIGNATURE_STORE, { keyPath: "id" });
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
  return normalizeSession(sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]);
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
  return normalizeSession(session);
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

/**
 * A reusable signature captured in the signature studio. Only typed styling
 * ({value, fontFamily, color}) or a data:image/(png|jpeg) payload in `value`
 * is ever persisted — no other blob shapes reach this store.
 */
export type SavedSignature = {
  id: string;
  createdAt: number;
  mode: "typed" | "image";
  value: string;
  color: string;
  fontFamily?: string;
};

export async function saveSignature(signature: SavedSignature) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SIGNATURE_STORE, "readwrite");
    tx.objectStore(SIGNATURE_STORE).put(signature);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listSignatures(): Promise<SavedSignature[]> {
  const db = await openDb();
  const signatures = await new Promise<SavedSignature[]>((resolve, reject) => {
    const tx = db.transaction(SIGNATURE_STORE, "readonly");
    const request = tx.objectStore(SIGNATURE_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return signatures.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSignature(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SIGNATURE_STORE, "readwrite");
    tx.objectStore(SIGNATURE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
