const controllers = new Map<string, AbortController>();
const cancelled = new Map<string, number>();

/** Private admission reads share the classifier cancellation ID before any async work. */
export function cancelConstrainedRouting(id: string) {
  controllers.get(id)?.abort();
  cancelled.set(id, Date.now());
  while (cancelled.size > 128) cancelled.delete(cancelled.keys().next().value!);
}
export async function withConstrainedRoutingCancellation<T>(id: string | undefined, run: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  if (id) {
    for (const [key, at] of cancelled) if (Date.now() - at > 30_000) cancelled.delete(key);
    if (cancelled.has(id)) controller.abort();
    controllers.get(id)?.abort(); controllers.set(id, controller);
  }
  try { controller.signal.throwIfAborted(); return await run(controller.signal); }
  finally { if (id && controllers.get(id) === controller) controllers.delete(id); }
}
