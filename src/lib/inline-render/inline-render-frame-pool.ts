/**
 * Which inline page frames are live. Every frame is a separate page with its
 * own document and scripts, so a long conversation must not keep dozens of
 * them running: a frame is mounted only while it is near the viewport, and
 * at most `INLINE_RENDER_MAX_LIVE_FRAMES` run at once, the least recently
 * used giving way first. A frame that gives way is unmounted (its page
 * reloads when it comes back), while its block keeps the last known height.
 *
 * Expanded frames are pinned: they stay live whatever the cap or scroll.
 */

export const INLINE_RENDER_MAX_LIVE_FRAMES = 6;

/** A frame mounts once it is this close to the viewport… */
export const INLINE_RENDER_MOUNT_MARGIN_PX = 600;
/** …and unmounts only once it is this far away, so a small scroll never thrashes it. */
export const INLINE_RENDER_KEEP_MARGIN_PX = 2_000;

/**
 * Hysteresis between the two zones: entering the mount zone makes a frame
 * near, leaving the keep zone makes it far, and in between it stays as it was.
 */
export function resolveInlineRenderFrameNear(args: {
  previous: boolean;
  inMountZone: boolean | undefined;
  inKeepZone: boolean | undefined;
}): boolean {
  if (args.inMountZone === true) return true;
  if (args.inKeepZone === false) return false;
  return args.previous;
}

interface PoolEntry {
  near: boolean;
  pinned: boolean;
  lastUsed: number;
}

export function createInlineRenderFramePool(options?: { maxLive?: number }) {
  const maxLive = Math.max(1, options?.maxLive ?? INLINE_RENDER_MAX_LIVE_FRAMES);
  const entries = new Map<string, PoolEntry>();
  const listeners = new Map<string, Set<() => void>>();
  let live = new Set<string>();
  let clock = 0;

  function recompute(touched?: string) {
    const candidates = [...entries.entries()]
      .filter(([, entry]) => entry.near || entry.pinned)
      .sort(
        ([, left], [, right]) =>
          Number(right.pinned) - Number(left.pinned) || right.lastUsed - left.lastUsed,
      );
    const pinnedCount = candidates.filter(([, entry]) => entry.pinned).length;
    const next = new Set(
      candidates.slice(0, Math.max(maxLive, pinnedCount)).map(([id]) => id),
    );
    const changed = new Set<string>();
    for (const id of next) if (!live.has(id)) changed.add(id);
    for (const id of live) if (!next.has(id)) changed.add(id);
    // The entry that changed may now be waiting rather than far, or the reverse.
    if (touched !== undefined) changed.add(touched);
    live = next;
    for (const id of changed) listeners.get(id)?.forEach((listener) => listener());
  }

  function update(id: string, change: (entry: PoolEntry) => void) {
    const entry = entries.get(id);
    if (!entry) return;
    change(entry);
    recompute(id);
  }

  return {
    register(id: string) {
      if (!entries.has(id)) entries.set(id, { near: false, pinned: false, lastUsed: ++clock });
    },
    unregister(id: string) {
      if (!entries.delete(id)) return;
      recompute();
    },
    /** A frame came near the viewport (counts as a use) or moved far from it. */
    setNear(id: string, near: boolean) {
      update(id, (entry) => {
        if (near && !entry.near) entry.lastUsed = ++clock;
        entry.near = near;
      });
    },
    /** The reader used the frame, or asked to show a frame that gave way. */
    touch(id: string) {
      update(id, (entry) => {
        entry.lastUsed = ++clock;
        entry.near = true;
      });
    },
    setPinned(id: string, pinned: boolean) {
      update(id, (entry) => {
        entry.pinned = pinned;
        if (pinned) entry.lastUsed = ++clock;
      });
    },
    isLive(id: string) {
      return live.has(id);
    },
    /** Near the viewport but over the cap: the block offers to show it. */
    isWaiting(id: string) {
      const entry = entries.get(id);
      return Boolean(entry?.near && !live.has(id));
    },
    liveCount() {
      return live.size;
    },
    subscribe(id: string, listener: () => void) {
      let set = listeners.get(id);
      if (!set) {
        set = new Set();
        listeners.set(id, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(id);
      };
    },
  };
}

export type InlineRenderFramePool = ReturnType<typeof createInlineRenderFramePool>;

/** One pool for the whole window: the cap counts frames in every pane. */
export const inlineRenderFramePool = createInlineRenderFramePool();

/**
 * What a block remembers about its page across unmounts (scrolled far away,
 * or the message list recycled its row): the height the page last reported,
 * so the block keeps its size, and whether it was expanded. Bounded, oldest
 * first out.
 */
export interface InlineRenderViewMemory {
  height?: number;
  expanded?: boolean;
}

const VIEW_MEMORY_MAX_ENTRIES = 500;

export function createInlineRenderViewMemory(maxEntries = VIEW_MEMORY_MAX_ENTRIES) {
  const memory = new Map<string, InlineRenderViewMemory>();
  return {
    get(renderId: string): InlineRenderViewMemory {
      return memory.get(renderId) ?? {};
    },
    set(renderId: string, patch: InlineRenderViewMemory) {
      const next = { ...memory.get(renderId), ...patch };
      memory.delete(renderId);
      memory.set(renderId, next);
      while (memory.size > maxEntries) {
        const oldest = memory.keys().next();
        if (oldest.done) break;
        memory.delete(oldest.value);
      }
    },
    get size() {
      return memory.size;
    },
  };
}

export const inlineRenderViewMemory = createInlineRenderViewMemory();
