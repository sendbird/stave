/**
 * One navigation that settles over several store writes — open a repository,
 * switch the workspace, then show the task — is one step for back/forward.
 * While a transition runs the history does not record the in-between places;
 * when the last one settles, it records where the user landed.
 */
let depth = 0;
const settledListeners = new Set<() => void>();

export async function runSurfaceTransition<T>(
  run: () => Promise<T>,
): Promise<T> {
  depth += 1;
  try {
    return await run();
  } finally {
    depth -= 1;
    if (depth === 0) {
      for (const listener of [...settledListeners]) {
        listener();
      }
    }
  }
}

export function isSurfaceTransitionActive() {
  return depth > 0;
}

/** Called each time the last running transition settles. */
export function onSurfaceTransitionSettled(listener: () => void): () => void {
  settledListeners.add(listener);
  return () => {
    settledListeners.delete(listener);
  };
}

/** Wraps an async action so each call runs as one surface transition. */
export function withSurfaceTransition<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return (...args) => runSurfaceTransition(() => action(...args));
}
