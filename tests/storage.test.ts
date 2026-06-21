import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessions,
  deleteSession,
  getLatestSession,
  getSession,
  listSessions,
  saveSession,
  type SavedSession,
  type SessionSaveInput,
} from "../src/utils/storage";

function makeInput(overrides: Partial<SessionSaveInput> = {}): SessionSaveInput {
  return {
    id: "s1",
    name: "Session 1",
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

// Cast through unknown to allow constructing partial/legacy session shapes
// directly (e.g. with only `operations`, or with neither) without touching src.
function putRaw(record: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("akki-pdf-editor", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

beforeEach(async () => {
  await clearSessions();
});

describe("storage", () => {
  it("saveSession then getSession round trip", async () => {
    const input = makeInput({ id: "round", name: "Round Trip" });
    await saveSession(input);
    const got = await getSession("round");
    expect(got).toBeDefined();
    expect(got?.id).toBe("round");
    expect(got?.name).toBe("Round Trip");
    expect(Array.from(got!.bytes)).toEqual([1, 2, 3]);
  });

  it("getSession returns undefined for unknown id", async () => {
    await saveSession(makeInput({ id: "known" }));
    const got = await getSession("does-not-exist");
    expect(got).toBeUndefined();
  });

  it("getLatestSession returns undefined when store empty", async () => {
    const latest = await getLatestSession();
    expect(latest).toBeUndefined();
  });

  it("getLatestSession returns the most recently updated", async () => {
    await saveSession(makeInput({ id: "old", updatedAt: 100 }));
    await saveSession(makeInput({ id: "newest", updatedAt: 300 }));
    await saveSession(makeInput({ id: "mid", updatedAt: 200 }));
    const latest = await getLatestSession();
    expect(latest?.id).toBe("newest");
  });

  it("listSessions sorts by updatedAt descending", async () => {
    await saveSession(makeInput({ id: "a", updatedAt: 100 }));
    await saveSession(makeInput({ id: "b", updatedAt: 300 }));
    await saveSession(makeInput({ id: "c", updatedAt: 200 }));
    const list = await listSessions();
    expect(list.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("derives operationCount from editState.operations, then operations, then 0", async () => {
    // 1) Has editState with operations -> uses editState.operations.length
    await putRaw({
      id: "with-editstate",
      name: "with editState",
      updatedAt: 30,
      bytes: new Uint8Array(),
      editState: { operations: [{ a: 1 }, { b: 2 }], past: [], future: [] },
      operations: [{ x: 1 }],
    });
    // 2) Only `operations` (no editState) -> falls back to operations.length
    await putRaw({
      id: "only-ops",
      name: "only operations",
      updatedAt: 20,
      bytes: new Uint8Array(),
      operations: [{ x: 1 }, { y: 2 }, { z: 3 }],
    });
    // 3) Neither -> falls back to 0
    await putRaw({
      id: "neither",
      name: "neither",
      updatedAt: 10,
      bytes: new Uint8Array(),
    });

    const list = await listSessions();
    const byId = Object.fromEntries(list.map((s) => [s.id, s.operationCount]));
    expect(byId["with-editstate"]).toBe(2);
    expect(byId["only-ops"]).toBe(3);
    expect(byId["neither"]).toBe(0);
    // also confirm pageIndex passes through (undefined when absent)
    const neither = list.find((s) => s.id === "neither");
    expect(neither?.pageIndex).toBeUndefined();
  });

  it("deleteSession removes a single session", async () => {
    await saveSession(makeInput({ id: "keep", updatedAt: 1 }));
    await saveSession(makeInput({ id: "drop", updatedAt: 2 }));
    await deleteSession("drop");
    const list = await listSessions();
    expect(list.map((s) => s.id)).toEqual(["keep"]);
    expect(await getSession("drop")).toBeUndefined();
  });

  it("clearSessions empties the store", async () => {
    await saveSession(makeInput({ id: "one" }));
    await saveSession(makeInput({ id: "two" }));
    await clearSessions();
    const list = await listSessions();
    expect(list).toEqual([]);
    expect(await getLatestSession()).toBeUndefined();
  });

  it("listSessions returns full summary shape", async () => {
    await saveSession(
      makeInput({
        id: "shape",
        name: "Shape",
        updatedAt: 42,
        pageIndex: 5,
        editState: { operations: [{ a: 1 } as never], past: [], future: [] },
      }),
    );
    const list = await listSessions();
    expect(list).toEqual([
      {
        id: "shape",
        name: "Shape",
        updatedAt: 42,
        operationCount: 1,
        pageIndex: 5,
      },
    ]);
  });

  it("saveSession overwrites an existing id (put semantics)", async () => {
    await saveSession(makeInput({ id: "dup", name: "first", updatedAt: 1 }));
    await saveSession(makeInput({ id: "dup", name: "second", updatedAt: 2 }));
    const got = (await getSession("dup")) as SavedSession;
    expect(got.name).toBe("second");
    const list = await listSessions();
    expect(list).toHaveLength(1);
  });
});

describe("storage error and edge branches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // openDb's onupgradeneeded with the object store already present exercises
  // the FALSE side of `if (!db.objectStoreNames.contains(STORE))`.
  it("onupgradeneeded does not recreate an existing object store", async () => {
    // Drive a real upgrade where the store already exists by faking the
    // request handed back from indexedDB.open.
    const db = {
      objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
      createObjectStore: vi.fn(),
      transaction: vi.fn(),
      close: vi.fn(),
    } as unknown as IDBDatabase;

    const request: Record<string, unknown> = { result: db, error: null };
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      queueMicrotask(() => {
        (request.onupgradeneeded as () => void)();
        (request.onsuccess as () => void)();
      });
      return request as unknown as IDBOpenDBRequest;
    });

    // saveSession calls openDb; stub transaction to complete immediately.
    const tx: Record<string, unknown> = {
      objectStore: () => ({ put: vi.fn() }),
    };
    (db.transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      queueMicrotask(() => (tx.oncomplete as () => void)());
      return tx as unknown as IDBTransaction;
    });

    await saveSession(makeInput({ id: "noop" }));
    expect((db.objectStoreNames.contains as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "sessions",
    );
    // store already existed -> createObjectStore must NOT be called
    expect(db.createObjectStore).not.toHaveBeenCalled();
  });

  it("openDb rejects when the open request errors", async () => {
    const request: Record<string, unknown> = { error: new Error("open failed") };
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      queueMicrotask(() => (request.onerror as () => void)());
      return request as unknown as IDBOpenDBRequest;
    });
    await expect(saveSession(makeInput({ id: "x" }))).rejects.toThrow("open failed");
  });

  // Helper: stub open to resolve with a db whose transaction we control.
  function stubDb(makeTx: () => Record<string, unknown>) {
    const db = {
      objectStoreNames: { contains: () => true },
      transaction: vi.fn(() => makeTx() as unknown as IDBTransaction),
      close: vi.fn(),
    };
    const request: Record<string, unknown> = { result: db };
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      queueMicrotask(() => (request.onsuccess as () => void)());
      return request as unknown as IDBOpenDBRequest;
    });
    return db;
  }

  it("saveSession rejects on transaction error", async () => {
    stubDb(() => {
      const tx: Record<string, unknown> = {
        error: new Error("tx put failed"),
        objectStore: () => ({ put: vi.fn() }),
      };
      queueMicrotask(() => (tx.onerror as () => void)());
      return tx;
    });
    await expect(saveSession(makeInput({ id: "y" }))).rejects.toThrow("tx put failed");
  });

  it("deleteSession rejects on transaction error", async () => {
    stubDb(() => {
      const tx: Record<string, unknown> = {
        error: new Error("tx delete failed"),
        objectStore: () => ({ delete: vi.fn() }),
      };
      queueMicrotask(() => (tx.onerror as () => void)());
      return tx;
    });
    await expect(deleteSession("y")).rejects.toThrow("tx delete failed");
  });

  it("clearSessions rejects on transaction error", async () => {
    stubDb(() => {
      const tx: Record<string, unknown> = {
        error: new Error("tx clear failed"),
        objectStore: () => ({ clear: vi.fn() }),
      };
      queueMicrotask(() => (tx.onerror as () => void)());
      return tx;
    });
    await expect(clearSessions()).rejects.toThrow("tx clear failed");
  });

  it("listSessions rejects when getAll request errors", async () => {
    stubDb(() => {
      const req: Record<string, unknown> = { error: new Error("getAll failed") };
      const tx: Record<string, unknown> = { objectStore: () => ({ getAll: () => req }) };
      queueMicrotask(() => (req.onerror as () => void)());
      return tx;
    });
    await expect(listSessions()).rejects.toThrow("getAll failed");
  });

  it("getLatestSession rejects when getAll request errors", async () => {
    stubDb(() => {
      const req: Record<string, unknown> = { error: new Error("getAll latest failed") };
      const tx: Record<string, unknown> = { objectStore: () => ({ getAll: () => req }) };
      queueMicrotask(() => (req.onerror as () => void)());
      return tx;
    });
    await expect(getLatestSession()).rejects.toThrow("getAll latest failed");
  });

  it("getSession rejects when get request errors", async () => {
    stubDb(() => {
      const req: Record<string, unknown> = { error: new Error("get failed") };
      const tx: Record<string, unknown> = { objectStore: () => ({ get: () => req }) };
      queueMicrotask(() => (req.onerror as () => void)());
      return tx;
    });
    await expect(getSession("nope")).rejects.toThrow("get failed");
  });
});
