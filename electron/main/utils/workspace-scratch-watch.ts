/**
 * Live change notices for open Scratch panels: one recursive `fs.watch` per
 * workspace scratch folder, shared by every window that has the panel open,
 * closed when the last one leaves.
 *
 * Bursts of writes (a log written line by line) are coalesced: the first
 * event in a quiet period schedules one notice `debounceMs` later and later
 * events in that window ride along, so a busy log produces a steady few
 * notices a second rather than none until it stops.
 *
 * A platform without recursive watching, a folder that cannot be watched, or
 * a watcher that fails later all end in `watching: false`: the window then
 * lists the folder on a timer instead (see `useWorkspaceScratchLive.ts`).
 *
 * Used by: `electron/main/ipc/workspace-scratch.ts`.
 */
import { promises as fs, watch } from "node:fs";
import path from "node:path";
import type { WorkspaceScratchChangedEvent } from "../../../src/lib/workspace-scratch";

export const WORKSPACE_SCRATCH_WATCH_DEBOUNCE_MS = 150;

export interface ScratchWatchHandle {
  close(): void;
}

/** The only file access the hub has; tests pass a fake. */
export interface ScratchWatchPort {
  /** A recursive watcher on `directory`, or null when the platform or folder refuses one. */
  watch(directory: string, onChange: () => void, onError: () => void): ScratchWatchHandle | null;
  /** Whether `directory` is still a real folder (it may have been removed). */
  isDirectory(directory: string): Promise<boolean>;
}

export const nodeScratchWatchPort: ScratchWatchPort = {
  watch(directory, onChange, onError) {
    try {
      const watcher = watch(directory, { recursive: true, persistent: false }, () => onChange());
      watcher.on("error", () => {
        watcher.close();
        onError();
      });
      return watcher;
    } catch {
      // ERR_FEATURE_UNAVAILABLE_ON_PLATFORM, ENOENT, EMFILE…: list on a timer instead.
      return null;
    }
  },
  async isDirectory(directory) {
    try {
      const stat = await fs.lstat(directory);
      return stat.isDirectory() && !stat.isSymbolicLink();
    } catch {
      return false;
    }
  },
};

interface WatchedRoot {
  rootPath: string;
  subscribers: Set<number>;
  handle: ScratchWatchHandle | null;
  starting: boolean;
  ready: Promise<boolean>;
  timer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

export class WorkspaceScratchWatchHub {
  private readonly roots = new Map<string, WatchedRoot>();
  private readonly port: ScratchWatchPort;
  private readonly debounceMs: number;

  constructor(
    private readonly options: {
      /** Delivers a notice to one subscriber (a window's `webContents` id). */
      notify: (subscriberId: number, event: WorkspaceScratchChangedEvent) => void;
      /** Makes the scratch folder (and refuses a linked one); returns its absolute path. */
      ensureFolder: (rootPath: string) => Promise<string>;
      port?: ScratchWatchPort;
      debounceMs?: number;
    },
  ) {
    this.port = options.port ?? nodeScratchWatchPort;
    this.debounceMs = options.debounceMs ?? WORKSPACE_SCRATCH_WATCH_DEBOUNCE_MS;
  }

  /**
   * Adds a subscriber to a root's watcher, starting it if needed. Resolves
   * whether the folder is watched; with false the subscriber lists on a timer.
   * Subscribing again after a failure tries the watcher again.
   */
  async subscribe(subscriberId: number, rootPath: string): Promise<{ watching: boolean }> {
    const key = path.resolve(rootPath);
    let entry = this.roots.get(key);
    if (!entry) {
      entry = { rootPath: key, subscribers: new Set(), handle: null, starting: false, ready: Promise.resolve(false), timer: null, closed: false };
      this.roots.set(key, entry);
      entry.ready = this.start(entry);
    } else if (!entry.handle && !entry.starting) {
      // The watcher failed earlier; a new subscription tries again.
      entry.ready = this.start(entry);
    }
    entry.subscribers.add(subscriberId);
    await entry.ready;
    return { watching: entry.handle !== null && !entry.closed };
  }

  unsubscribe(subscriberId: number, rootPath: string) {
    const key = path.resolve(rootPath);
    const entry = this.roots.get(key);
    if (!entry) return;
    entry.subscribers.delete(subscriberId);
    if (entry.subscribers.size === 0) this.close(key, entry);
  }

  /** A window closed: drop all of its subscriptions. */
  removeSubscriber(subscriberId: number) {
    for (const [key, entry] of [...this.roots]) {
      if (!entry.subscribers.delete(subscriberId)) continue;
      if (entry.subscribers.size === 0) this.close(key, entry);
    }
  }

  /** Roots with an open watcher, for tests and diagnostics. */
  watchedRoots(): string[] {
    return [...this.roots.values()].filter((entry) => entry.handle).map((entry) => entry.rootPath);
  }

  subscriberCount(rootPath: string): number {
    return this.roots.get(path.resolve(rootPath))?.subscribers.size ?? 0;
  }

  dispose() {
    for (const [key, entry] of [...this.roots]) this.close(key, entry);
  }

  private async start(entry: WatchedRoot): Promise<boolean> {
    entry.starting = true;
    try {
      let directory: string;
      try {
        directory = await this.options.ensureFolder(entry.rootPath);
      } catch {
        return false;
      }
      // Everyone left while the folder was being made.
      if (entry.closed) return false;
      const handle = this.port.watch(
        directory,
        () => this.onChange(entry, directory),
        () => this.onFailure(entry),
      );
      if (!handle) return false;
      entry.handle = handle;
      return true;
    } finally {
      entry.starting = false;
    }
  }

  private onChange(entry: WatchedRoot, directory: string) {
    if (entry.closed || entry.timer) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (entry.closed) return;
      void this.port.isDirectory(directory).then((exists) => {
        if (entry.closed) return;
        // A removed folder is watched no more (the watcher holds the old
        // one); the windows list on a timer until a turn makes it again.
        if (!exists) {
          this.onFailure(entry);
          return;
        }
        this.broadcast(entry, true);
      });
    }, this.debounceMs);
  }

  private onFailure(entry: WatchedRoot) {
    if (entry.closed) return;
    entry.handle?.close();
    entry.handle = null;
    this.broadcast(entry, false);
  }

  private broadcast(entry: WatchedRoot, watching: boolean) {
    const event: WorkspaceScratchChangedEvent = { rootPath: entry.rootPath, watching };
    for (const subscriberId of [...entry.subscribers]) this.options.notify(subscriberId, event);
  }

  private close(key: string, entry: WatchedRoot) {
    entry.closed = true;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.handle?.close();
    entry.handle = null;
    if (this.roots.get(key) === entry) this.roots.delete(key);
  }
}
