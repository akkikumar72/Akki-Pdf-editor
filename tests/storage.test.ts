import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessions,
  closeStorageConnection,
  deleteSession,
  deleteSignature,
  getLatestSession,
  getSession,
  listSessions,
  listSignatures,
  saveSession,
  saveSignature,
  type SavedSession,
  type SavedSignature,
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
    const request = indexedDB.open("akki-pdf-editor", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("signatures")) {
        db.createObjectStore("signatures", { keyPath: "id" });
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

  it("operationCount excludes retired operation types, matching what restore will actually load", async () => {
    // A session saved before the table-region tool was retired: listSessions
    // must not advertise "2 edits" for a session that restores with 1.
    await putRaw({
      id: "has-retired-op",
      name: "Legacy",
      updatedAt: 40,
      bytes: new Uint8Array(),
      editState: {
        operations: [{ id: "t1", type: "table-region" }, { id: "l1", type: "link", href: "https://x.dev" }],
        past: [],
        future: [],
      },
    });
    const list = await listSessions();
    const entry = list.find((s) => s.id === "has-retired-op");
    expect(entry?.operationCount).toBe(1);
    // Confirms this actually matches what a restore returns.
    const restored = await getSession("has-retired-op");
    expect(restored?.editState?.operations).toHaveLength(1);
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

  it("normalizes legacy { href } link operations everywhere on session load", async () => {
    const rect = { x: 1, y: 2, width: 10, height: 5 };
    const legacyUrl = { id: "l1", type: "link", pageIndex: 0, rect, createdAt: 1, href: "https://x.dev" };
    const legacyMail = { id: "l2", type: "link", pageIndex: 0, rect, createdAt: 2, href: "mailto:a@b.dev" };
    await putRaw({
      id: "legacy-links",
      name: "Legacy",
      updatedAt: 99,
      bytes: new Uint8Array([1]),
      operations: [legacyUrl],
      editState: {
        operations: [legacyUrl, legacyMail],
        past: [{ id: "h1", label: "add", timestamp: 1, operations: [legacyUrl] }],
        future: [{ id: "h2", label: "redo", timestamp: 2, operations: [legacyMail] }],
      },
    });
    const got = await getSession("legacy-links");
    const ops = got!.editState!.operations as Array<{ target?: unknown; href?: unknown }>;
    expect(ops[0].target).toEqual({ kind: "url", href: "https://x.dev" });
    expect(ops[1].target).toEqual({ kind: "email", href: "mailto:a@b.dev" });
    expect(ops[0].href).toBeUndefined();
    expect((got!.operations![0] as { target?: unknown }).target).toEqual({ kind: "url", href: "https://x.dev" });
    expect((got!.editState!.past[0].operations[0] as { target?: unknown }).target).toEqual({ kind: "url", href: "https://x.dev" });
    expect((got!.editState!.future[0].operations[0] as { target?: unknown }).target).toEqual({ kind: "email", href: "mailto:a@b.dev" });

    const latest = await getLatestSession();
    expect((latest!.editState!.operations[0] as { target?: unknown }).target).toEqual({ kind: "url", href: "https://x.dev" });
  });

  it("normalizes sessions missing operations or editState without inventing them", async () => {
    await putRaw({ id: "bare", name: "Bare", updatedAt: 5, bytes: new Uint8Array([1]) });
    const got = await getSession("bare");
    expect(got?.operations).toBeUndefined();
    expect(got?.editState).toBeUndefined();
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

describe("signature store", () => {
  function makeSignature(overrides: Partial<SavedSignature> = {}): SavedSignature {
    return {
      id: "sig-1",
      createdAt: 100,
      mode: "typed",
      value: "Akki",
      color: "#000000",
      fontFamily: "Caveat",
      ...overrides,
    };
  }

  beforeEach(async () => {
    for (const signature of await listSignatures()) {
      await deleteSignature(signature.id);
    }
  });

  it("saves, lists (newest first), and deletes signatures", async () => {
    await saveSignature(makeSignature({ id: "old", createdAt: 100 }));
    await saveSignature(makeSignature({ id: "new", createdAt: 300, mode: "image", value: "data:image/png;base64,AAAA", fontFamily: undefined }));
    const list = await listSignatures();
    expect(list.map((signature) => signature.id)).toEqual(["new", "old"]);
    expect(list[0].mode).toBe("image");
    await deleteSignature("new");
    expect((await listSignatures()).map((signature) => signature.id)).toEqual(["old"]);
  });

  it("saveSignature overwrites an existing id (put semantics)", async () => {
    await saveSignature(makeSignature({ id: "dup", value: "first" }));
    await saveSignature(makeSignature({ id: "dup", value: "second" }));
    const list = await listSignatures();
    expect(list).toHaveLength(1);
    expect(list[0].value).toBe("second");
  });
});

describe("shared connection lifecycle", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await closeStorageConnection();
  });

  it("reuses one IndexedDB connection across calls", async () => {
    await closeStorageConnection();
    const openSpy = vi.spyOn(indexedDB, "open");
    await saveSession(makeInput({ id: "reuse-1" }));
    await saveSession(makeInput({ id: "reuse-2" }));
    await listSessions();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("closeStorageConnection is a no-op when nothing is open", async () => {
    await closeStorageConnection();
    await expect(closeStorageConnection()).resolves.toBeUndefined();
  });

  it("releases the shared connection on versionchange and reopens lazily", async () => {
    await closeStorageConnection();
    const db = {
      objectStoreNames: { contains: () => true },
      transaction: vi.fn(() => {
        const tx: Record<string, unknown> = { objectStore: () => ({ put: vi.fn() }) };
        queueMicrotask(() => (tx.oncomplete as () => void)());
        return tx as unknown as IDBTransaction;
      }),
      close: vi.fn(),
      onversionchange: null as (() => void) | null,
    };
    const request: Record<string, unknown> = { result: db };
    const openSpy = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      queueMicrotask(() => (request.onsuccess as () => void)());
      return request as unknown as IDBOpenDBRequest;
    });

    await saveSession(makeInput({ id: "vc-1" }));
    expect(openSpy).toHaveBeenCalledTimes(1);

    // Simulate another tab requesting a schema upgrade.
    db.onversionchange!();
    expect(db.close).toHaveBeenCalledTimes(1);

    await saveSession(makeInput({ id: "vc-2" }));
    expect(openSpy).toHaveBeenCalledTimes(2);
  });

  it("releases the shared connection on a browser-forced close and reopens lazily", async () => {
    // Unlike onversionchange (another tab upgrading), the browser can close
    // the connection unilaterally (storage eviction, private-mode limits) —
    // that fires `close`, not `versionchange`, and self-healing here is what
    // keeps autosave from breaking silently for the rest of the session.
    await closeStorageConnection();
    const db = {
      objectStoreNames: { contains: () => true },
      transaction: vi.fn(() => {
        const tx: Record<string, unknown> = { objectStore: () => ({ put: vi.fn() }) };
        queueMicrotask(() => (tx.oncomplete as () => void)());
        return tx as unknown as IDBTransaction;
      }),
      close: vi.fn(),
      onversionchange: null as (() => void) | null,
      onclose: null as (() => void) | null,
    };
    const request: Record<string, unknown> = { result: db };
    const openSpy = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      queueMicrotask(() => (request.onsuccess as () => void)());
      return request as unknown as IDBOpenDBRequest;
    });

    await saveSession(makeInput({ id: "close-1" }));
    expect(openSpy).toHaveBeenCalledTimes(1);

    // Simulate the browser force-closing the connection.
    db.onclose!();

    await saveSession(makeInput({ id: "close-2" }));
    expect(openSpy).toHaveBeenCalledTimes(2);
  });

  it("closeStorageConnection swallows a connection that never opened", async () => {
    await closeStorageConnection();
    const request: Record<string, unknown> = { error: new Error("open failed") };
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      queueMicrotask(() => (request.onerror as () => void)());
      return request as unknown as IDBOpenDBRequest;
    });
    const pendingSave = saveSession(makeInput({ id: "never-opens" }));
    // Close while the rejecting open is still in flight.
    await expect(closeStorageConnection()).resolves.toBeUndefined();
    await expect(pendingSave).rejects.toThrow("open failed");
  });
});

describe("storage error and edge branches", () => {
  beforeEach(async () => {
    // Error tests stub indexedDB.open per test, so the shared connection from
    // earlier tests must be dropped for the stub to be consulted at all.
    await closeStorageConnection();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Drop any stubbed connection so later tests reopen the real fake-indexeddb.
    await closeStorageConnection();
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

  it("saveSignature rejects on transaction error", async () => {
    stubDb(() => {
      const tx: Record<string, unknown> = {
        error: new Error("tx sig put failed"),
        objectStore: () => ({ put: vi.fn() }),
      };
      queueMicrotask(() => (tx.onerror as () => void)());
      return tx;
    });
    await expect(
      saveSignature({ id: "s", createdAt: 1, mode: "typed", value: "x", color: "#000" }),
    ).rejects.toThrow("tx sig put failed");
  });

  it("deleteSignature rejects on transaction error", async () => {
    stubDb(() => {
      const tx: Record<string, unknown> = {
        error: new Error("tx sig delete failed"),
        objectStore: () => ({ delete: vi.fn() }),
      };
      queueMicrotask(() => (tx.onerror as () => void)());
      return tx;
    });
    await expect(deleteSignature("s")).rejects.toThrow("tx sig delete failed");
  });

  it("listSignatures rejects when getAll request errors", async () => {
    stubDb(() => {
      const req: Record<string, unknown> = { error: new Error("sig getAll failed") };
      const tx: Record<string, unknown> = { objectStore: () => ({ getAll: () => req }) };
      queueMicrotask(() => (req.onerror as () => void)());
      return tx;
    });
    await expect(listSignatures()).rejects.toThrow("sig getAll failed");
  });
});
