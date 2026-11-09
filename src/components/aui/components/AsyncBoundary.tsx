import { TriangleAlert } from "lucide-react";
import type * as React from "react";

import type { AsyncState } from "../utils/async";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

export type AsyncBoundaryProps<T> = {
  /** Render prop for the loaded data. */
  children: (data: T) => React.ReactNode;
  /**
   * Turn an error into human copy. Defaults to the `Error` message (or the
   * stringified value).
   */
  describeError?: (error: unknown) => React.ReactNode;
  /**
   * Rendered instead of `children` when the data loaded but `isEmpty(data)`
   * is true — typically an `EmptyState`.
   */
  empty?: React.ReactNode;
  /** Title of the error `EmptyState`, in the host's words. */
  errorTitle: React.ReactNode;
  /** Decide whether loaded data counts as empty (pairs with `empty`). */
  isEmpty?: (data: T) => boolean;
  /**
   * Re-run the load after an error; renders a retry action on the error
   * state (typically `refresh` from `useAsync`).
   */
  onRetry?: () => void;
  /** The pending surface, typically a `LoadingSurface` with the host's label. */
  pending: React.ReactNode;
  /** Label of the retry button, in the host's words. */
  retryLabel: React.ReactNode;
  /** Title of the banner over stale data after a failed refresh. */
  refreshErrorTitle: string;
  /** Note under the refresh error, saying the last result stays on screen. */
  staleNotice: React.ReactNode;
  state: AsyncState<T>;
};

function defaultDescribe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The pending / error / empty / ready switch every data-backed surface
 * repeats, in one place. Pairs with `useAsync`: pending renders an honest
 * `LoadingSurface`, errors render an `EmptyState` with an optional retry
 * action, and `empty`/`isEmpty` cover loaded-but-blank data. A failed refresh
 * keeps the last successful result visible and places one recovery banner
 * before it instead of replacing the work surface with an initial-load error.
 * Slots take ready elements, so apps can swap any state for their own surface.
 */
export function AsyncBoundary<T>({
  children,
  describeError = defaultDescribe,
  empty,
  errorTitle,
  isEmpty,
  onRetry,
  pending,
  retryLabel,
  refreshErrorTitle,
  staleNotice,
  state,
}: AsyncBoundaryProps<T>) {
  if (state.status === "pending") {
    return pending;
  }
  if (state.status === "error") {
    return (
      <EmptyState
        action={
          onRetry ? { children: retryLabel, onClick: onRetry } : undefined
        }
        description={describeError(state.error)}
        icon={<TriangleAlert aria-hidden size={20} />}
        role="alert"
        title={errorTitle}
        tone="danger"
      />
    );
  }
  const content =
    empty != null && isEmpty?.(state.data) ? empty : children(state.data);

  if (!state.stale) return content;

  return (
    <>
      <Banner
        action={
          onRetry ? (
            <Button onClick={onRetry} size="sm" variant="outline">
              {retryLabel}
            </Button>
          ) : undefined
        }
        title={refreshErrorTitle}
        tone="danger"
      >
        {describeError(state.refreshError)}
        <br />
        {staleNotice}
      </Banner>
      {content}
    </>
  );
}
