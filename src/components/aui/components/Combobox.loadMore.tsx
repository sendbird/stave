import { i18n } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";

import { surfaceChrome } from "../recipes/surface-chrome";
import { vars } from "../tokens/tokens.stylex";
import { sx } from "../utils/stylex";
import { Button } from "./Button";

/**
 * The async / paged loading contract for the array-shaped pickers.
 *
 * `loading` was a boolean that swapped the whole list body for a text row, so
 * a server-backed picker had exactly one state to say everything with: the
 * first page and the tenth looked identical, and every call site that wanted
 * infinite scroll re-implemented the observer itself. This module is the one
 * implementation; `Combobox` and `Autocomplete` both consume it, which is why
 * it is a sibling module and not a second copy inside each component.
 *
 * **Two loading states, on purpose.** `loading` means "there is nothing to
 * show yet" and REPLACES the list — a spinner over stale rows would let the
 * user click an option that the pending query is about to remove. `loadingMore`
 * means "there is more coming after what you are reading" and APPENDS a strip
 * under the existing options, because the rows already on screen are still
 * valid and scrolling must not jump. Collapsing the two into one boolean is
 * what forces the first behaviour onto the second.
 *
 * **The query channel already exists; there is no `onSearchChange`.** Every
 * keystroke reaches the caller today, and both pickers pass the callback
 * straight through to Base UI's root:
 *
 *  - `Combobox` → `onInputValueChange(query, details)`. Its `onValueChange` is
 *    the SELECTION, so the input has its own event.
 *  - `Autocomplete` → `onValueChange(query, details)`. It has no selection to
 *    report — the value it produces IS the input string — so Base UI omits
 *    `onInputValueChange` there and this is the same event under the name that
 *    control uses.
 *
 * Adding an `onSearchChange` alias would put a second name on one event, and
 * the two would drift the first time either grew an argument. Drive a
 * server-backed fetch from the callback the control already has.
 */

export type ComboboxPagingProps = {
  /**
   * Whether the server has more rows after the ones in `options`. Drives the
   * scroll sentinel; when it turns false the sentinel unmounts and paging
   * stops. @default false
   */
  hasMore?: boolean;
  /**
   * A page is being appended to the options already on screen. Distinct from
   * `loading`, which replaces the list — see this module's header.
   * @default false
   */
  loadingMore?: boolean;
  /** Copy for the appended row. @default "Loading more…" */
  loadingMoreText?: React.ReactNode;
  /**
   * Label for the manual fallback button, used only where
   * `IntersectionObserver` is unavailable. @default "Load more"
   */
  loadMoreLabel?: React.ReactNode;
  /**
   * Failure from the current remote option request. With no options it
   * replaces the empty list; with retained options it becomes a recovery row
   * below them. This is request state, not the field-validation `error` prop.
   */
  loadError?: React.ReactNode;
  /**
   * Fetch the next page. Called when the sentinel row scrolls into the popup's
   * scroll container, and never while `loading` or `loadingMore` is true.
   */
  onLoadMore?: () => void;
  /** Retry the request represented by `loadError`. */
  onLoadRetry?: () => void;
  /** Label for the request recovery action. @default "Retry" */
  retryLabel?: React.ReactNode;
};

export type LoadMorePaging = {
  hasMore: boolean;
  loadError: React.ReactNode;
  loadingMore: boolean;
  /**
   * `IntersectionObserver` is missing, so the sentinel cannot fire and the
   * footer renders a real button instead. The capability is never unreachable.
   */
  manual: boolean;
  onLoadMore: (() => void) | undefined;
  onLoadRetry: (() => void) | undefined;
  retryLabel: React.ReactNode;
  /** Callback ref for the sentinel row rendered as the list's last child. */
  ref: (node: HTMLDivElement | null) => void;
};

/**
 * The observer root is the popup's own scroll container, found by walking up
 * from the sentinel rather than threading a ref through `List`. A sentinel
 * observed against a root it does not descend from never reports an
 * intersection, and walking up is what makes the hook work for both the array
 * APIs and any compound composition that puts the list somewhere else.
 */
function scrollAncestor(node: HTMLElement): HTMLElement | null {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") {
      return parent;
    }
  }
  // No scroll container in the chain: fall back to the viewport.
  return null;
}

export function useLoadMore({
  hasMore = false,
  loadError,
  loading = false,
  loadingMore = false,
  onLoadMore,
  onLoadRetry,
  retryLabel = i18n.t("ui:combobox.retry"),
}: ComboboxPagingProps & { loading?: boolean }): LoadMorePaging {
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  /*
   * Starts optimistic and is corrected in an effect: reading
   * `typeof IntersectionObserver` during render would make the server (always
   * "missing") and the client (almost always "present") disagree on the first
   * paint and tear the hydration. The button only appears on a runtime that
   * actually lacks the observer, one commit later.
   */
  const [observable, setObservable] = useState(true);
  // The callback is read through a ref so a caller's inline arrow does not
  // re-create the observer on every render — re-observing re-fires the
  // callback, which would page in a loop for a sentinel that is already on
  // screen.
  const latest = useRef({ loadError, loading, loadingMore, onLoadMore });
  latest.current = { loadError, loading, loadingMore, onLoadMore };

  useEffect(() => {
    setObservable(typeof IntersectionObserver !== "undefined");
  }, []);

  useEffect(() => {
    if (
      !sentinel ||
      !hasMore ||
      loadError != null ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        // The re-entrancy guard: a page that is already in flight owns the
        // sentinel until the caller says it landed.
        if (
          latest.current.loadError != null ||
          latest.current.loading ||
          latest.current.loadingMore
        ) {
          return;
        }
        latest.current.onLoadMore?.();
      },
      { root: scrollAncestor(sentinel) },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    /*
     * The loading flags are deliberately dependencies as well as guards:
     * settling them rebuilds the observer, and observing re-reports the current
     * intersection. That is the continuation — a short page that leaves the
     * sentinel on screen keeps filling the viewport instead of stalling until
     * the user scrolls it out and back in.
     */
  }, [hasMore, loadError, loading, loadingMore, sentinel]);

  return {
    hasMore,
    loadError,
    loadingMore,
    manual: !observable,
    onLoadMore,
    onLoadRetry,
    ref: setSentinel,
    retryLabel,
  };
}

export type LoadMoreSentinelProps = {
  paging: LoadMorePaging;
};

/**
 * The scroll probe, rendered as the last child INSIDE the list so it shares the
 * list's scroll container. It is `aria-hidden` and presentational because a
 * `listbox` owns options and groups only — this row is geometry, not content.
 */
export function LoadMoreSentinel({ paging }: LoadMoreSentinelProps) {
  if (!paging.hasMore || paging.loadError != null || paging.manual) return null;
  return (
    <div
      aria-hidden
      className={sx(styles.sentinel)}
      ref={paging.ref}
      role="presentation"
    />
  );
}

export type LoadMoreFooterProps = {
  loadingMoreText: React.ReactNode;
  loadMoreLabel: React.ReactNode;
  paging: LoadMorePaging;
};

/**
 * The appended half of the two loading states. It sits UNDER the list rather
 * than inside it for two reasons: a focusable button is not a valid child of
 * `role="listbox"`, and a strip outside the scroll area stays visible while the
 * user is still reading the rows it belongs to — which is exactly the "more is
 * coming" claim it makes. The initial `loading` row, which replaces the list
 * entirely, is the other half and lives at each component's call site.
 */
export function LoadMoreFooter({
  loadingMoreText,
  loadMoreLabel,
  paging,
}: LoadMoreFooterProps) {
  if (paging.loadError != null) {
    return (
      <LoadFailure
        error={paging.loadError}
        footer
        onRetry={paging.onLoadRetry}
        retryLabel={paging.retryLabel}
      />
    );
  }
  if (paging.loadingMore) {
    return (
      <div className={sx(styles.footer, styles.footerStatus)} role="status">
        {loadingMoreText}
      </div>
    );
  }
  if (!paging.hasMore || !paging.manual) return null;
  return (
    <div className={sx(styles.footer)}>
      <Button onClick={paging.onLoadMore} size="sm" variant="quiet">
        {loadMoreLabel}
      </Button>
    </div>
  );
}

export type LoadFailureProps = {
  error: React.ReactNode;
  footer?: boolean;
  onRetry?: () => void;
  retryLabel?: React.ReactNode;
};

/**
 * One compact recovery anatomy for initial and appended request failures. It
 * stays flat inside the popup and wraps long server copy instead of widening
 * the anchored surface.
 *
 * Tone rides the GLYPH and nothing else, per design-direction §1.2 — the same
 * split `Alert`, `Banner`, `Callout` and `Charts` already hold. This row used
 * to paint the message itself `danger-text` with no glyph at all, which washed
 * the tone across the copy the rule keeps neutral and left the failure with no
 * mark to recognise it by.
 *
 * `AlertTriangle`, named here rather than read from `toneIcons`: that map
 * belongs to message SURFACES and may change with them, while a row whose
 * content failed to LOAD takes the triangle `Charts.states` set as the
 * precedent.
 *
 * `outlined`, not `quiet`. A quiet button at rest is bare text, and in a popup
 * where every other line is also text the one thing the reader must be able to
 * press did not look pressable. Every other retry in the system —
 * `AsyncBoundary`, `Charts` — is outlined.
 */
export function LoadFailure({
  error,
  footer = false,
  onRetry,
  retryLabel = i18n.t("ui:combobox.retry"),
}: LoadFailureProps) {
  return (
    <div
      className={sx(
        styles.failure,
        footer && styles.failureFooter,
        footer && styles.failureStrip,
      )}
      role="alert"
    >
      <AlertTriangle
        aria-hidden
        className={sx(
          styles.failureIcon,
          footer && surfaceChrome.leadingGlyphNudge,
        )}
        size={16}
      />
      <span
        className={sx(
          styles.failureMessage,
          footer && styles.failureMessageFooter,
        )}
      >
        {error}
      </span>
      {onRetry ? (
        <Button
          className={sx(styles.failureAction)}
          onClick={onRetry}
          size={footer ? "xs" : "sm"}
          variant="outline"
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  // 1px, not 0: a zero-height box is still observable, but a hairline survives
  // a `display: flex` list that would otherwise collapse it against its
  // neighbour's margin box.
  sentinel: {
    blockSize: 1,
    flexShrink: 0,
    inlineSize: "100%",
  },
  /*
   * A hairline separates the strip from the last option so the appended state
   * cannot be mistaken for one more row to click. The initial `loading` row
   * deliberately looks different: it is the `listbox.empty` block in the middle
   * of an otherwise empty popup.
   */
  footer: {
    alignItems: "center",
    borderBlockStartColor: vars["--aui-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    padding: vars["--aui-space-4"],
  },
  footerStatus: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  /*
   * Centred, and given air, because this is a STATE of the surface rather than
   * a row in it: it replaces the whole list, it carries the only control the
   * reader can press, and `Charts.states` and `EmptyState` — the two other
   * places a failure takes over a bounded box — both centre. Left-aligned at
   * the option gutter it read as one more row that happened to be red.
   *
   * `space20` block, against `listbox.empty`'s 12: the empty message is one
   * line the reader passes over, this is two elements they have to act on.
   * The FOOTER arm below takes it back to 8 — appended under real rows it is a
   * strip, and a strip that tall pushes the rows it belongs to off-screen.
   */
  failure: {
    display: "grid",
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
    justifyItems: "center",
    maxInlineSize: "100%",
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-20"],
    paddingInline: vars["--aui-space-12"],
    textAlign: "center",
  },
  /*
   * The footer arm is a STRIP, not a state: it sits under rows that are still
   * valid, so it lays the same three parts out on one line instead of stacking
   * them, and stays centred the way the `loadingMore` strip beside it already
   * is. Stacked here it ran ~80px tall and pushed the rows it belongs to off
   * the popup.
   */
  failureStrip: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    justifyContent: "center",
    paddingBlock: vars["--aui-space-8"],
  },
  failureFooter: {
    borderBlockStartColor: vars["--aui-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
  },
  /*
   * The only thing tone paints. It gets its own row in the stacked arm — a
   * glyph beside centred copy leaves the mark hanging off the first line while
   * the text centres under itself — and drops back beside the message in the
   * strip, where `leadingGlyphNudge` puts it on the line.
   */
  failureIcon: {
    color: vars["--aui-color-danger"],
    flexShrink: 0,
  },
  /*
   * Body size, matching `listbox.empty`. Both say "there is nothing to show
   * you" in the middle of an otherwise empty popup, and this one was a step
   * smaller — so the failure read as less important than the empty state it
   * replaces. The FOOTER arm below steps it back down: appended under real
   * rows it is a strip, not the popup's subject.
   *
   * Neutral, not `danger-text`: §1.2 keeps the tone on the glyph. Red body copy
   * also loses to the message itself — the words say what failed, the colour
   * only repeats that something did.
   */
  failureMessage: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    maxInlineSize: "100%",
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  failureMessageFooter: {
    fontSize: vars["--aui-font-size-caption"],
  },
  /*
   * Nothing to align to any more. This used to be pulled out of the block's
   * gutter by `space12 - space4` so the label's left edge met the message's,
   * which was the whole reason the correction existed; centred, the message
   * has no left edge to meet. The button keeps its own padding — that was
   * always the point of correcting with a margin instead of zeroing
   * `paddingInline`, since a wash or a border drawn tight around the word is
   * not a button shape.
   */
  failureAction: {
    justifySelf: "center",
  },
});
