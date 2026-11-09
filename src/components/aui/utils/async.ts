import { useCallback, useEffect, useRef, useState } from "react";
import type * as React from "react";

/** Discriminated load state shared by `useAsync` and `AsyncBoundary`. */
export type AsyncState<T> =
  | { status: "pending" }
  | { error: unknown; status: "error" }
  | {
      data: T;
      /** Present only when a refresh failed after this data loaded. */
      refreshError?: unknown;
      /** The data is the last successful result, not a response to the latest refresh. */
      stale?: boolean;
      status: "ready";
    };

export type AsyncLoadContext = {
  /** Aborted when dependencies change, a refresh supersedes this load, or the consumer unmounts. */
  signal: AbortSignal;
};

/**
 * Load-once async state with stale-while-revalidate refresh: the first load
 * (and any `deps` change) shows `pending`; later `refresh()` calls keep the
 * current data on screen until the reload settles, so in-place edits never
 * flash the whole view. A failed refresh preserves that result as `stale`
 * with `refreshError`; only an initial-load failure becomes `status: "error"`.
 * Superseded work is aborted and any loader that cannot consume the signal is
 * still protected by the out-of-order result guard.
 */
export function useAsync<T>(
  loader: (context: AsyncLoadContext) => Promise<T>,
  deps: React.DependencyList = [],
): { refresh: () => void; state: AsyncState<T> } {
  const [state, setState] = useState<AsyncState<T>>({ status: "pending" });
  const [tick, setTick] = useState(0);
  const loaderRef = useRef<(context: AsyncLoadContext) => Promise<T>>(loader);
  loaderRef.current = loader;
  const runRef = useRef(0);

  // Reset to pending when the load identity changes (not on refresh).
  useEffect(() => {
    setState({ status: "pending" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const run = ++runRef.current;
    const controller = new AbortController();
    loaderRef.current({ signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted && run === runRef.current) {
          setState({ data, status: "ready" });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted || run !== runRef.current) return;
        setState((current) =>
          current.status === "ready"
            ? {
                data: current.data,
                refreshError: error,
                stale: true,
                status: "ready",
              }
            : { error, status: "error" },
        );
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const refresh = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  return { refresh, state };
}

/**
 * Guard a user-triggered async action against duplicate submissions.
 *
 * The in-flight flag lives in a ref so two same-tick clicks cannot both enter
 * the action before React paints the pending state. `pending` is still state
 * so callers can disable controls and expose loading feedback.
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
) {
  const actionRef = useRef(action);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  actionRef.current = action;

  const run = useCallback(async (...args: TArgs) => {
    if (pendingRef.current) {
      return undefined;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      return await actionRef.current(...args);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, []);

  return { pending, run };
}
