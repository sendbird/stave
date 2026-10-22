import { i18n, useTranslation } from "@/i18n";
import {
  AsyncBoundary as AdsAsyncBoundary,
  type AsyncBoundaryProps,
} from "@/components/ads/components/AsyncBoundary";
import { LoadingSurface } from "@/components/ads/components/LoadingSurface";

import type { AsyncState } from "@/components/ads/utils/async";

export type { AsyncState };

/**
 * The boundary state of a panel that tracks its own read: whether a read is
 * running, whether any read has succeeded, and the last read's error. A
 * failure before any success is an error, and a retry of it is pending again;
 * after a success, the last data stays, marked stale. Without a read in flight
 * and without a success (no bridge to read from), the panel shows its data as
 * read.
 */
export function panelLoadState<T>(args: {
  data: T;
  loaded: boolean;
  loading?: boolean;
  error?: string | null;
}): AsyncState<T> {
  if (args.error) {
    if (args.loaded) return { status: "ready", data: args.data, stale: true, refreshError: args.error };
    return args.loading ? { status: "pending" } : { status: "error", error: args.error };
  }
  if (!args.loaded && args.loading !== false) return { status: "pending" };
  return { status: "ready", data: args.data };
}

type HostWords = "errorTitle" | "retryLabel" | "refreshErrorTitle" | "staleNotice" | "pending";

export type HostAsyncBoundaryProps<T> = Omit<AsyncBoundaryProps<T>, HostWords> &
  Partial<Pick<AsyncBoundaryProps<T>, HostWords>>;

/**
 * ADS `AsyncBoundary` with Stave's words in English and Korean: the pending,
 * error, empty and ready switch for a panel that reads data, which keeps the
 * last result on screen under a notice when a refresh fails. A failed read
 * never renders as the empty state. Props passed by the caller win.
 */
export function AsyncBoundary<T>(props: HostAsyncBoundaryProps<T>) {
  useTranslation();
  return (
    <AdsAsyncBoundary
      pending={<LoadingSurface label={i18n.t("common:asyncBoundary.loading")} size="sm" />}
      errorTitle={i18n.t("common:asyncBoundary.errorTitle")}
      retryLabel={i18n.t("common:actions.retry")}
      refreshErrorTitle={i18n.t("common:asyncBoundary.refreshFailed")}
      staleNotice={i18n.t("common:asyncBoundary.staleNotice")}
      {...props}
    />
  );
}
