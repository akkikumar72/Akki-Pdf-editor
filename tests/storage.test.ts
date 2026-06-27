import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSessions,
  deleteSession,
  getLatestSession,
  getSession,
  listSessions,
  saveSession,
  type SessionSaveInput,
} from "../src/utils/storage";

const realIndexedDB = indexedDB;

function input(overrides: Partial<SessionSaveInput> = {}): SessionSaveInput {
  return {
    id: "s1",
    name: "Doc 1",
    updatedAt: 1000,
    bytes: new Uint8Array([1, 2, 3]),
    pageIndex: 0,
    scale: 1,
    rotation: 0,
    editState: { operations: [], past: [], future: [] },
    operations: [],
    ...overrides,
  };
}

beforeEach(() => {
  // Fresh in-memory database per test.
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  globalThis.indexedDB = realIndexedDB;
});

describe("storage round trip (fake-indexeddb)", () => {
  it("saves, lists, reads, and deletes a session", async () => {
    await saveSession(input({ id: "a", name: "Alpha", updatedAt: 10 }));
    await saveSession(
      input({
        id: "b",
        name: "Beta",
        updatedAt: 20,
        editState: {
          operations: [
            {
              id: "t1",
              type: "text",
              pageIndex: 0,
              rect: { x: 0, y: 0, width: 1, height: 1 },
              text: "x",
              fontFamily: "Inter",
              fontSize: 12,
              color: "#000",
              align: "left",
              createdAt: 1,
            },
          ],
          past: [],
          future: [],
        },
      }),
    );

    const list = await listSessions();
    expect(list.map((s) => s.id)).toEqual(["b", "a"]); // sorted by updatedAt desc
    expect(list[0].operationCount).toBe(1);
    expect(list[1].operationCount).toBe(0);

    const latest = await getLatestSession();
    expect(latest?.id).toBe("b");

    const fetched = await getSession("a");
    expect(fetched?.name).toBe("Alpha");

    await deleteSession("a");
    expect((await listSessions()).map((s) => s.id)).toEqual(["b"]);

    await clearSessions();
    expect(await listSessions()).toEqual([]);
    expect(await getLatestSession()).toBeUndefined();
    expect(await getSession("b")).toBeUndefined();
  });

  it("counts operations from the legacy operations field when editState is absent", async () => {
    // Write a legacy-shaped record directly so listSessions exercises the
    // `editState?.operations.length ?? operations?.length ?? 0` fallback chain.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("akki-pdf-editor", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("sessions", { keyPath: "id" });
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("sessions", "readwrite");
        tx.objectStore("sessions").put({
          id: "legacy",
          name: "Legacy",
          updatedAt: 5,
          bytes: new Uint8Array(),
          operations: [{ id: "o1" }, { id: "o2" }],
        });
        tx.objectStore("sessions").put({ id: "bare", name: "Bare", updatedAt: 1, bytes: new Uint8Array() });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const list = await listSessions();
    expect(list.find((s) => s.id === "legacy")?.operationCount).toBe(2);
    expect(list.find((s) => s.id === "bare")?.operationCount).toBe(0);
  });
});

// A configurable stub that drives the request/transaction callbacks so the
// reject branches (open error, transaction error, request error) are exercised.
type StubConfig = {
  failOpen?: boolean;
  failWrite?: boolean;
  failRead?: boolean;
};

function installStub(config: StubConfig) {
  const fire = (fn: (() => void) | null) => Promise.resolve().then(() => fn?.());
  const store = {
    put: () => undefined,
    delete: () => undefined,
    clear: () => undefined,
    getAll: () => {
      const r = { onsuccess: null as null | (() => void), onerror: null as null | (() => void), result: [], error: new Error("read fail") };
      fire(() => (config.failRead ? r.onerror?.() : r.onsuccess?.()));
      return r;
    },
    get: () => {
      const r = { onsuccess: null as null | (() => void), onerror: null as null | (() => void), result: undefined, error: new Error("read fail") };
      fire(() => (config.failRead ? r.onerror?.() : r.onsuccess?.()));
      return r;
    },
  };
  const db = {
    close: () => undefined,
    transaction: () => {
      const tx = { objectStore: () => store, oncomplete: null as null | (() => void), onerror: null as null | (() => void), error: new Error("tx fail") };
      fire(() => (config.failWrite ? tx.onerror?.() : tx.oncomplete?.()));
      return tx;
    },
  };
  globalThis.indexedDB = {
    open: () => {
      const req = { onsuccess: null as null | (() => void), onerror: null as null | (() => void), onupgradeneeded: null, result: db, error: new Error("open fail") };
      fire(() => (config.failOpen ? req.onerror?.() : req.onsuccess?.()));
      return req;
    },
  } as unknown as IDBFactory;
}

describe("storage error branches", () => {
  it("rejects when the database fails to open", async () => {
    installStub({ failOpen: true });
    await expect(saveSession(input())).rejects.toBeInstanceOf(Error);
  });

  it("rejects writes when the transaction errors", async () => {
    installStub({ failWrite: true });
    await expect(saveSession(input())).rejects.toBeInstanceOf(Error);
    await expect(deleteSession("a")).rejects.toBeInstanceOf(Error);
    await expect(clearSessions()).rejects.toBeInstanceOf(Error);
  });

  it("rejects reads when the request errors", async () => {
    installStub({ failRead: true });
    await expect(listSessions()).rejects.toBeInstanceOf(Error);
    await expect(getLatestSession()).rejects.toBeInstanceOf(Error);
    await expect(getSession("a")).rejects.toBeInstanceOf(Error);
  });
});
