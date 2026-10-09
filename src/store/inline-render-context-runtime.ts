import {
  buildInlineRenderModelContextPart,
  type InlineRenderModelContext,
  type InlineRenderModelContextEntry,
} from "@/lib/inline-render/inline-render-interaction";
import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";

/**
 * Renderer side of inline page context (`window.stave.updateModelContext`).
 *
 * The page block reports updates here; the latest one per page is kept for
 * its indicator at once and written to the main process store after a short
 * pause, so a page that reports on every keystroke costs one write. A send
 * flushes pending writes, then reads the task's contexts back from main,
 * which binds each page to the task it was published in.
 *
 * Without the desktop bridge (the browser-only preview) contexts live in
 * memory for the session, keyed by the task the block was shown in.
 */

export interface InlineRenderModelContextBridge {
  setModelContext?: (args: {
    renderId: string;
    context: InlineRenderModelContext | null;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  readModelContext?: (args: { renderId: string }) => Promise<
    { ok: true; entry: InlineRenderModelContextEntry | null } | { ok: false; error: string }
  >;
  listTaskModelContexts?: (args: { workspaceId: string | null; taskId: string }) => Promise<
    { ok: true; entries: InlineRenderModelContextEntry[] } | { ok: false; error: string }
  >;
}

interface LocalEntry {
  taskId: string;
  entry: InlineRenderModelContextEntry | null;
}

export const INLINE_RENDER_MODEL_CONTEXT_WRITE_DELAY_MS = 300;

export function createInlineRenderContextRuntime(options: {
  getBridge: () => InlineRenderModelContextBridge | undefined;
  now?: () => Date;
  writeDelayMs?: number;
}) {
  const now = options.now ?? (() => new Date());
  const writeDelayMs = options.writeDelayMs ?? INLINE_RENDER_MODEL_CONTEXT_WRITE_DELAY_MS;
  const local = new Map<string, LocalEntry>();
  const loaded = new Set<string>();
  const listeners = new Map<string, Set<() => void>>();
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; flush: () => Promise<void> }>();
  /** Writes per page run in order, so a clear can never land before an older update. */
  const chains = new Map<string, Promise<void>>();

  const bridge = () => {
    const current = options.getBridge();
    return current?.setModelContext && current.listTaskModelContexts ? current : undefined;
  };

  function emit(renderId: string) {
    listeners.get(renderId)?.forEach((listener) => listener());
  }

  function setLocal(renderId: string, value: LocalEntry) {
    local.set(renderId, value);
    loaded.add(renderId);
    emit(renderId);
  }

  function enqueueWrite(renderId: string, context: InlineRenderModelContext | null) {
    const target = bridge();
    if (!target?.setModelContext) return;
    const previous = pending.get(renderId);
    if (previous) clearTimeout(previous.timer);
    const flush = () => {
      pending.delete(renderId);
      const run = (chains.get(renderId) ?? Promise.resolve()).then(async () => {
        try {
          await target.setModelContext?.({ renderId, context });
        } catch {
          // Best effort: the indicator still reflects what the page reported,
          // and the page's next update writes again.
        }
      });
      chains.set(renderId, run);
      return run;
    };
    const timer = setTimeout(() => void flush(), writeDelayMs);
    pending.set(renderId, { timer, flush });
  }

  async function flushPendingWrites() {
    const flushes = [...pending.values()].map((entry) => {
      clearTimeout(entry.timer);
      return entry.flush();
    });
    await Promise.all([...flushes, ...chains.values()]);
  }

  return {
    /** The page's current context; `undefined` until it is known. */
    getSnapshot(renderId: string): InlineRenderModelContextEntry | null | undefined {
      return loaded.has(renderId) ? (local.get(renderId)?.entry ?? null) : undefined;
    },

    subscribe(renderId: string, listener: () => void) {
      let set = listeners.get(renderId);
      if (!set) {
        set = new Set();
        listeners.set(renderId, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(renderId);
      };
    },

    /** Reads a page's stored context once, so its indicator survives a restart. */
    async load(args: { renderId: string; taskId: string }) {
      if (loaded.has(args.renderId)) return;
      const read = bridge()?.readModelContext;
      if (!read) {
        setLocal(args.renderId, { taskId: args.taskId, entry: null });
        return;
      }
      try {
        const result = await read({ renderId: args.renderId });
        // An update that arrived while the read was in flight is newer.
        if (loaded.has(args.renderId)) return;
        setLocal(args.renderId, { taskId: args.taskId, entry: result.ok ? result.entry : null });
      } catch {
        if (!loaded.has(args.renderId)) setLocal(args.renderId, { taskId: args.taskId, entry: null });
      }
    },

    /** The page's latest report: it replaces the previous one, or clears it with `null`. */
    update(args: {
      renderId: string;
      taskId: string;
      title: string;
      context: InlineRenderModelContext | null;
    }) {
      setLocal(args.renderId, {
        taskId: args.taskId,
        entry: args.context
          ? {
              renderId: args.renderId,
              title: args.title,
              context: args.context,
              updatedAt: now().toISOString(),
            }
          : null,
      });
      enqueueWrite(args.renderId, args.context);
    },

    clear(args: { renderId: string; taskId: string }) {
      setLocal(args.renderId, { taskId: args.taskId, entry: null });
      enqueueWrite(args.renderId, null);
    },

    /**
     * The retrieved-context part for a task's next turn, or none. Pending
     * writes are flushed first, so an update made just before Send is in it.
     */
    async collectParts(args: {
      workspaceId: string | null;
      taskId: string;
    }): Promise<CanonicalRetrievedContextPart[]> {
      let entries: InlineRenderModelContextEntry[];
      const target = bridge();
      if (target?.listTaskModelContexts) {
        try {
          await flushPendingWrites();
          const result = await target.listTaskModelContexts(args);
          entries = result.ok ? result.entries : [];
        } catch {
          entries = [];
        }
      } else {
        entries = [...local.values()].flatMap((value) =>
          value.taskId === args.taskId && value.entry ? [value.entry] : [],
        );
      }
      const part = buildInlineRenderModelContextPart(entries);
      return part ? [part] : [];
    },
  };
}

export type InlineRenderContextRuntime = ReturnType<typeof createInlineRenderContextRuntime>;

export const inlineRenderContextRuntime = createInlineRenderContextRuntime({
  getBridge: () => (typeof window === "undefined" ? undefined : window.api?.inlineRender),
});

/** Called by the send path; best effort, never fails a turn. */
export async function collectInlineRenderContextParts(args: {
  workspaceId: string | null;
  taskId: string;
}): Promise<CanonicalRetrievedContextPart[]> {
  try {
    return await inlineRenderContextRuntime.collectParts(args);
  } catch {
    return [];
  }
}
