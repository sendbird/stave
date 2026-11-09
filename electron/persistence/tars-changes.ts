import type { TarsChangeScope } from "../../src/lib/tars/types";

export type TarsChangeListener = (scopes: readonly TarsChangeScope[]) => void;

/**
 * The listeners a Tars store reports its writes to. A store reports inside
 * the write, possibly before its transaction commits, so a listener that
 * reads must defer (see `createTarsChangeBatcher`). A failing listener never
 * fails the write.
 */
export class TarsChangeSignal {
  private readonly listeners = new Set<TarsChangeListener>();

  subscribe(listener: TarsChangeListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  emit(...scopes: TarsChangeScope[]) {
    for (const listener of this.listeners) {
      try { listener(scopes); } catch (error) { console.warn("[tars] a change listener failed", error); }
    }
  }
}

/**
 * Reports each changed scope once after the current synchronous work. Store
 * writes are synchronous SQLite transactions, so when the microtask runs the
 * write has committed and any reader, on this or another connection, sees it.
 * A rolled-back write may cost one spurious report, never a missed one.
 */
export function createTarsChangeBatcher(report: (scope: TarsChangeScope) => void): TarsChangeListener {
  const pending = new Set<TarsChangeScope>();
  let scheduled = false;
  return (scopes) => {
    for (const scope of scopes) pending.add(scope);
    if (scheduled || pending.size === 0) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const batch = [...pending];
      pending.clear();
      for (const scope of batch) {
        try { report(scope); } catch (error) { console.warn("[tars] a change report failed", error); }
      }
    });
  };
}
