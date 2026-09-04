import type { StampType } from "@omnianote/shared";

export type OutboxStatus = "QUEUED" | "UPLOADING" | "SYNCED" | "FAILED";

export interface OutboxEntry {
  localId: string;
  type: "PHOTO" | "VIDEO" | "PDF" | "NOTE";
  title: string;
  body?: string;
  stamps?: StampType[];
  fileExtension?: string;
  contentType?: string;
  fileBlob?: Blob;
  thumbnailBlob?: Blob;
  clientCreatedAt: string;
  status: OutboxStatus;
  errorMessage?: string;
  createdAt: number;
}

const DB_NAME = "omnianote-outbox";
const STORE_NAME = "outbox";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "localId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const req = fn(tx.objectStore(STORE_NAME));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Captured items are written here first, synced to the server in the
 * background, and only removed once the server confirms it — a photo,
 * video, or note is never held only in memory, so a dropped connection or a
 * closed tab mid-capture can't lose it. IndexedDB rather than localStorage
 * specifically because it can store the actual file Blob (photo/video/pdf
 * bytes, plus the client-generated thumbnail) without a base64 round trip,
 * and its storage quota is orders of magnitude larger.
 */
export const outboxDb = {
  put: (entry: OutboxEntry): Promise<void> =>
    withStore("readwrite", (store) => store.put(entry)).then(() => undefined),
  getAll: (): Promise<OutboxEntry[]> => withStore<OutboxEntry[]>("readonly", (store) => store.getAll()),
  delete: (localId: string): Promise<void> =>
    withStore("readwrite", (store) => store.delete(localId)).then(() => undefined),
};
