import { useEffect, useState } from "react";
import type { CreateItemInput } from "@omnianote/shared";
import { uploadToPresignedUrl } from "./apiClient";
import { itemsApi } from "./items";
import { outboxDb, type OutboxEntry } from "./outboxDb";

type Listener = (entries: OutboxEntry[]) => void;
const listeners = new Set<Listener>();
let cachedEntries: OutboxEntry[] = [];
let processing = false;

async function refreshAndNotify(): Promise<void> {
  cachedEntries = await outboxDb.getAll();
  cachedEntries.sort((a, b) => a.createdAt - b.createdAt);
  listeners.forEach((listener) => listener(cachedEntries));
}

/**
 * Drains the outbox one entry at a time (never in parallel — keeps error
 * handling and IndexedDB writes simple to reason about). Re-reads the store
 * after every entry rather than working off one snapshot, so a capture that
 * lands mid-flush gets picked up in the same pass instead of waiting for the
 * next timer tick.
 *
 * Each entry gets at most one attempt per call: a failure is left as FAILED
 * for the *next* call (the periodic timer, the next `online` event, or a
 * manual retry) rather than retried immediately in a tight loop — a bad
 * first attempt without this would busy-loop against a downed server as
 * fast as promises resolve, since the loop would keep re-fetching the same
 * still-present FAILED entry and trying it again instantly.
 *
 * Wrapped in a Web Lock keyed by name, not just the in-memory `processing`
 * flag — that flag only guards against re-entrancy *within one tab's JS
 * realm*. The outbox itself is shared browser-wide storage, so two tabs (or
 * a tab plus an installed PWA instance) open to the same account would
 * otherwise each run their own independent drain loop against it and could
 * both pick up and create the same entry. `navigator.locks` serializes that
 * across tabs for free; browsers without it (older Safari) just fall back to
 * the single-tab guarantee this already had.
 */
const SYNC_LOCK_NAME = "omnianote-sync-queue";

async function processQueue(): Promise<void> {
  if (processing || !navigator.onLine) return;
  // Best-effort for the automatic paths (timer, online event, enqueue): if
  // another tab already holds the lock, skip this round entirely rather than
  // queueing up behind it — that tab's own pass will cover the same entries.
  if ("locks" in navigator) {
    await navigator.locks.request(SYNC_LOCK_NAME, { ifAvailable: true }, (lock) => (lock ? drainQueue() : undefined));
  } else {
    await drainQueue();
  }
}

async function drainQueue(): Promise<void> {
  processing = true;
  const attemptedThisPass = new Set<string>();
  try {
    let entries = await outboxDb.getAll();
    while (navigator.onLine) {
      const next = entries.find((e) => !attemptedThisPass.has(e.localId));
      if (!next) break;
      attemptedThisPass.add(next.localId);
      // A SYNCED entry only lingers mid-flush for its brief on-screen grace
      // period (see syncOne) — one surviving into a fresh processQueue() run
      // means the app closed during that window after the server copy was
      // already created. Just clean it up; re-running syncOne on it would
      // create a duplicate item on the server.
      if (next.status === "SYNCED") await outboxDb.delete(next.localId);
      else await syncOne(next);
      entries = await outboxDb.getAll();
    }
  } finally {
    processing = false;
  }
}

async function syncOne(entry: OutboxEntry): Promise<void> {
  await outboxDb.put({ ...entry, status: "UPLOADING", errorMessage: undefined });
  await refreshAndNotify();
  try {
    const input: CreateItemInput = {
      type: entry.type,
      title: entry.title,
      body: entry.body,
      stamps: entry.stamps,
      fileExtension: entry.fileExtension,
      clientCreatedAt: entry.clientCreatedAt,
    };
    const { item, uploadUrl, thumbnailUploadUrl } = await itemsApi.create(input);
    if (uploadUrl && entry.fileBlob) {
      await uploadToPresignedUrl(uploadUrl, entry.fileBlob, entry.contentType ?? "application/octet-stream");
      await itemsApi.confirmUpload(item.id, entry.fileBlob.size, entry.contentType ?? "application/octet-stream");
    }
    if (thumbnailUploadUrl && entry.thumbnailBlob) {
      try {
        await uploadToPresignedUrl(thumbnailUploadUrl, entry.thumbnailBlob, "image/jpeg");
      } catch {
        // Best-effort, same as the online capture path — a missing thumbnail
        // just falls back to the type icon, it never blocks the capture.
      }
    }
    // Held briefly as SYNCED (visible in the UI) rather than deleted immediately —
    // the point of a visible sync-status UI is that "Synced" is a state someone
    // actually sees, not just an instant that flashes by as the entry vanishes.
    await outboxDb.put({ ...entry, status: "SYNCED", errorMessage: undefined });
    await refreshAndNotify();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await outboxDb.delete(entry.localId);
  } catch (err) {
    await outboxDb.put({
      ...entry,
      status: "FAILED",
      errorMessage: err instanceof Error ? err.message : "Couldn't sync — will retry automatically.",
    });
  }
  await refreshAndNotify();
}

export const syncQueue = {
  /** Replays the current snapshot immediately, then calls back on every change. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(cachedEntries);
    return () => {
      listeners.delete(listener);
    };
  },

  async enqueue(entry: Omit<OutboxEntry, "localId" | "status" | "createdAt" | "errorMessage">): Promise<void> {
    await outboxDb.put({ ...entry, localId: crypto.randomUUID(), status: "QUEUED", createdAt: Date.now() });
    await refreshAndNotify();
    void processQueue();
  },

  /**
   * A user tapping "retry" is an explicit action, unlike the background timer/online
   * triggers — it waits its turn for the lock rather than skipping if busy, and holds
   * that lock for the *entire* attempt (the status re-check through the full syncOne
   * call), not just the initial status flip. An earlier version released the lock
   * right after flipping FAILED -> QUEUED and made a separate call to trigger the
   * drain; that gap between "release" and "re-acquire to actually sync" was enough
   * for a concurrent automatic retry of the very same entry to also see FAILED, also
   * flip it, and also sync it — the item got created on the server twice. Holding one
   * lock across the whole thing closes that gap: whichever caller (this retry, or an
   * automatic pass) acquires it first fully finishes syncing-or-re-failing the entry
   * before anyone else is allowed to look at it again.
   */
  async retry(localId: string): Promise<void> {
    if (!navigator.onLine) return;
    const attempt = async () => {
      const entry = (await outboxDb.getAll()).find((e) => e.localId === localId);
      if (!entry || entry.status !== "FAILED") return;
      await syncOne(entry);
    };
    if ("locks" in navigator) {
      await navigator.locks.request(SYNC_LOCK_NAME, attempt);
    } else {
      await attempt();
    }
  },
};

/** Live view of the outbox — re-renders whenever an entry is added, changes status, or syncs out. */
export function useOutbox(): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>(cachedEntries);
  useEffect(() => syncQueue.subscribe(setEntries), []);
  return entries;
}

// The `online` event only reflects the network interface coming back, not
// real internet reachability (e.g. wifi with no uplink) — the periodic timer
// is the fallback that eventually notices either way. The initial call
// catches anything left over from a previous session that ended offline.
window.addEventListener("online", () => void processQueue());
setInterval(() => void processQueue(), 25_000);
void refreshAndNotify().then(() => void processQueue());
