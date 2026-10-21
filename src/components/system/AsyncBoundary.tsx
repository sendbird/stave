import { i18n, useTranslation } from "@/i18n";
import {
  AsyncBoundary as AdsAsyncBoundary,
  type AsyncBoundaryProps,
} from "@/components/ads/components/AsyncBoundary";
import { LoadingSurface } from "@/components/ads/components/LoadingSurface";

export type { AsyncState } from "@/components/ads/utils/async";

/**
 * ADS `AsyncBoundary` with Stave's words in English and Korean: the pending,
 * error, empty and ready switch for a panel that reads data, which keeps the
 * last result on screen under a notice when a refresh fails. A failed read
 * never renders as the empty state. Props passed by the caller win.
 */
type HostWords = "errorTitle" | "retryLabel" | "refreshErrorTitle" | "staleNotice" | "pending";

export type HostAsyncBoundaryProps<T> = Omit<AsyncBoundaryProps<T>, HostWords> &
  Partial<Pick<AsyncBoundaryProps<T>, HostWords>>;

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
