"use client";

/**
 * Minimal vanilla IndexedDB wrapper for a single object store. Not a
 * general-purpose helper — just enough to give `action-queue.ts` a
 * promise-based `get all / put / delete`, without pulling in a dependency
 * for three operations.
 */

const DB_NAME = "split-offline";
const DB_VERSION = 1;
const STORE_NAME = "queued-actions";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error as Error);
  });
  return dbPromise;
}

function runRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
        const request = run(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error as Error);
      }),
  );
}

export function getAllRecords<T>(): Promise<T[]> {
  return runRequest("readonly", (store) => store.getAll());
}

export function putRecord<T>(record: T): Promise<void> {
  return runRequest("readwrite", (store) => store.put(record)).then(() => undefined);
}

export function deleteRecord(id: string): Promise<void> {
  return runRequest("readwrite", (store) => store.delete(id)).then(() => undefined);
}
