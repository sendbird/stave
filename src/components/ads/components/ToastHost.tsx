import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  X,
} from "lucide-react";
import { useMemo } from "react";
import type * as React from "react";

import {
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
  useToastManager,
  type ToastProviderProps,
} from "../headless/toast";
import { controlIconSizes, controlSquares } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { surfaceChrome } from "../recipes/surface-chrome";
import {
  PortalProductThemeScope,
  usePortalProductThemeProps,
} from "../theming/ProductThemeProvider";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx } from "../utils/stylex";
import { Button } from "./Button";
import { Loader } from "./Loader";
import { runToastPromise, type ToastPromiseApi } from "./ToastHost.promise";
import { styles, toneIconStyles } from "./ToastHost.styles";

export type ToastTone =
  | "danger"
  | "info"
  | "loading"
  | "neutral"
  | "success"
  | "warning";

export type ToastPosition =
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "top-left"
  | "top-right";

export type ToastHostProps = {
  children?: React.ReactNode;
  /** Max stacked toasts before older ones fold away. @default 3 */
  limit?: ToastProviderProps["limit"];
  /**
   * Host modification: an externally created Base UI toast manager, so a
   * store — which cannot call `useToast()` — can push notifications into this
   * host. Omit it and the provider creates its own, which is upstream's
   * behaviour.
   */
  toastManager?: ToastProviderProps["toastManager"];
  /** Where the toast viewport is anchored. @default "bottom-right" */
  position?: ToastPosition;
  /** Default auto-dismiss delay in ms (`0` disables). @default 5000 */
  timeout?: ToastProviderProps["timeout"];
};

export type ToastOptions = {
  /** Action button label; composes `Button` size `sm`. */
  actionLabel?: React.ReactNode;
  description?: React.ReactNode;
  /** Stable id (for `close`/`update`); auto-generated when omitted. */
  id?: string;
  /**
   * Action click handler. The toast closes after the handler runs unless it
   * calls `event.preventDefault()`.
   */
  onAction?: React.MouseEventHandler<HTMLButtonElement>;
  /** Screen-reader announcement priority. @default "low" */
  priority?: "high" | "low";
  /**
   * Per-toast auto-dismiss override in ms (`0` persists). Defaults to the
   * host timeout — except `tone="loading"`, which persists until closed or
   * replaced so in-flight work never silently vanishes.
   */
  timeout?: number;
  title: React.ReactNode;
  /** Semantic tone (icon color on a neutral card). @default "neutral" */
  tone?: ToastTone;
};

export type ToastApi = ToastPromiseApi & {
  /** Dismiss a toast by id (animates out). */
  close: (id: string) => void;
  /** `tone: "danger"` shorthand. */
  error: (title: React.ReactNode, description?: React.ReactNode) => string;
  /** `tone: "info"` shorthand. */
  info: (title: React.ReactNode, description?: React.ReactNode) => string;
  /**
   * `tone: "loading"` shorthand — persists until closed or updated. Resolve
   * it with `update(id, { tone: "success", ... })` or `close(id)`.
   */
  loading: (title: React.ReactNode, description?: React.ReactNode) => string;
  /** Show a toast; returns its id. */
  push: (options: ToastOptions) => string;
  /** `tone: "success"` shorthand. */
  success: (title: React.ReactNode, description?: React.ReactNode) => string;
  /** Update a visible toast in place (e.g. resolve a loading toast). */
  update: (id: string, options: Partial<ToastOptions>) => void;
  /** `tone: "warning"` shorthand. */
  warning: (title: React.ReactNode, description?: React.ReactNode) => string;
};

let toastSequence = 0;

// The manager's normal auto-dismiss delay — same default `ToastHost.timeout`
// establishes for the Base UI `ToastProvider` it wraps. `toManagerOptions`
// reuses it below so an `update()` that resolves a loading toast to a
// terminal tone gets an explicit `timeout` (not just the removal of the
// `timeout: 0` a loading toast carries), which is what makes the merge over
// the existing toast actually reset its dismiss timer instead of pinning it.
const DEFAULT_TOAST_TIMEOUT_MS = 5000;

/** Map `ToastOptions` fields onto Base UI toast-manager options. */
function toManagerOptions(
  { actionLabel, onAction, timeout, tone, ...content }: Partial<ToastOptions>,
  toastId: string,
  close: (id: string) => void,
) {
  return {
    ...content,
    actionProps: actionLabel
      ? {
          children: actionLabel,
          onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
            onAction?.(event);

            if (!event.defaultPrevented) {
              close(toastId);
            }
          },
        }
      : undefined,
    // In-flight work must not silently vanish: loading toasts persist until
    // closed or replaced by a terminal success/danger toast. An explicit
    // `timeout` always wins; otherwise a defined non-loading tone gets the
    // manager's normal default so `update()` resets a still-pinned `timeout: 0`
    // left over from the toast's `loading` tone — merging tone alone would
    // otherwise leave the old `timeout: 0` in place forever.
    ...(timeout !== undefined
      ? { timeout }
      : tone === "loading"
        ? { timeout: 0 }
        : tone !== undefined
          ? { timeout: DEFAULT_TOAST_TIMEOUT_MS }
          : null),
    ...(tone !== undefined ? { type: tone } : null),
  };
}

/**
 * Imperative toast handle. Must be called under `ToastHost` (or another
 * headless `ToastProvider`). `push` takes full `ToastOptions`; the tone
 * shorthands cover the common "title + optional description" notice.
 */
export function useToast(): ToastApi {
  const manager = useToastManager();

  return useMemo(() => {
    const close = (id: string) => manager.close(id);
    const push = (options: ToastOptions) => {
      const toastId = options.id ?? `ads-toast-${++toastSequence}`;

      manager.add({
        ...toManagerOptions({ tone: "neutral", ...options }, toastId, close),
        id: toastId,
      });

      return toastId;
    };
    const pushTone =
      (tone: ToastTone) =>
      (title: React.ReactNode, description?: React.ReactNode) =>
        push({ description, title, tone });

    const api: ToastApi = {
      close,
      error: pushTone("danger"),
      info: pushTone("info"),
      loading: pushTone("loading"),
      // Reuses `loading` + `update` below; see `ToastHost.promise.ts`.
      promise: (promise, messages) => runToastPromise(api, promise, messages),
      push,
      success: pushTone("success"),
      update: (id, options) =>
        manager.update(id, toManagerOptions(options, id, close)),
      warning: pushTone("warning"),
    };

    return api;
  }, [manager]);
}

const toneIcons = {
  danger: ShieldAlert,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
} as const;

type SwipeDirection = "down" | "left" | "right" | "up";

/** Resolve viewport placement, swipe direction, and stack direction per position. */
function resolvePosition(position: ToastPosition) {
  const [vertical, horizontal] = position.split("-") as [
    "bottom" | "top",
    "center" | "left" | "right",
  ];
  const isTop = vertical === "top";
  const swipe: SwipeDirection =
    horizontal === "center" ? (isTop ? "up" : "down") : horizontal;
  return { horizontal, isTop, swipe };
}

/**
 * App-level toast host on the Base UI toast manager: wrap the app once, then
 * push notices from anywhere with `useToast()`. Renders the styled ADS toast
 * stack (stacked viewport, swipe-dismiss, `limit` folding, `loading` tone
 * that persists until resolved). Tone reads from the leading icon on a
 * neutral raised card — never a tone wash. Actions compose `Button`
 * (size `sm`): inline at the end of the row for single-line toasts, in a
 * bottom-end row when a description makes the toast multi-line (toast-stack
 * placement).
 */
export function ToastHost({
  children,
  limit = 3,
  position = "bottom-right",
  timeout = DEFAULT_TOAST_TIMEOUT_MS,
  toastManager,
}: ToastHostProps) {
  const { horizontal, isTop, swipe } = resolvePosition(position);
  // The stack leaves the host's DOM subtree through the portal, so it carries
  // the brand with it. `@scope` is a fact about the DOM tree and a portal is
  // exactly where the DOM tree and the React tree disagree — without this, a
  // toast host mounted inside a branded region drops to ADS's own paint.
  const portalTheme = usePortalProductThemeProps();

  return (
    <ToastProvider limit={limit} timeout={timeout} toastManager={toastManager}>
      {children}
      <ToastPortal>
        <PortalProductThemeScope>
          <ToastViewport
            {...portalTheme}
            className={sx(
              styles.viewport,
              isTop ? styles.viewportTop : styles.viewportBottom,
              horizontal === "left" && styles.viewportLeft,
              horizontal === "center" && styles.viewportCenter,
              horizontal === "right" && styles.viewportRight,
            )}
          >
            <ToastHostList isTop={isTop} swipe={swipe} />
          </ToastViewport>
        </PortalProductThemeScope>
      </ToastPortal>
    </ToastProvider>
  );
}

function ToastHostList({
  isTop,
  swipe,
}: {
  isTop: boolean;
  swipe: SwipeDirection;
}) {
  const { toasts } = useToastManager();

  return toasts.map((toast) => {
    const tone = (toast.type ?? "neutral") as ToastTone;
    const Icon =
      tone === "neutral" || tone === "loading" ? null : toneIcons[tone];
    // Toast-stack action placement: a single-line toast keeps the action
    // inline at the end of the row (vertically centered); once a description
    // makes the toast multi-line, the action drops to a bottom-end row below
    // the whole row — including the trailing close column — so it never floats
    // mid-card and its trailing edge lines up with the close button's, flush
    // to the card's inline padding rather than inset by a close-button width.
    const hasAction = Boolean(toast.actionProps);
    const hasDescription = Boolean(toast.description);
    const inlineAction = hasAction && !hasDescription;

    const theme = themeProps("toast", { tone });

    return (
      <ToastRoot
        {...theme}
        className={(state) =>
          cx(
            sx(
              styles.toast,
              isTop ? styles.toastTop : styles.toastBottom,
              state.limited && styles.toastLimited,
            ),
            theme.className,
            "atelier-toast-stack",
            isTop && "atelier-toast-stack-top",
          )
        }
        key={toast.id}
        swipeDirection={swipe}
        toast={toast}
      >
        <ToastContent
          {...themeSlotProps("toast", "content")}
          className={sx(styles.content)}
        >
          <div
            className={sx(styles.row, hasDescription && styles.rowMultiline)}
          >
            {tone === "loading" ? (
              <span
                {...themeSlotProps("toast", "icon")}
                className={sx(
                  styles.icon,
                  hasDescription && styles.iconMultiline,
                  styles.iconLoading,
                )}
              >
                <Loader aria-hidden size="xs" />
              </span>
            ) : Icon ? (
              // The glyph gets its own slot rather than being styled directly:
              // when a description makes the toast multi-line the row
              // top-aligns, and the slot is what carries the title's line box
              // so the glyph can be centred on it by flex alignment (see
              // `iconMultiline`).
              <span
                {...themeSlotProps("toast", "icon")}
                className={sx(
                  styles.icon,
                  hasDescription && styles.iconMultiline,
                  toneIconStyles[tone as keyof typeof toneIconStyles],
                )}
              >
                <Icon aria-hidden size={18} />
              </span>
            ) : null}
            <div className={sx(styles.copy)}>
              <ToastTitle
                {...themeSlotProps("toast", "title")}
                className={sx(styles.title)}
              />
              <ToastDescription
                {...themeSlotProps("toast", "description")}
                className={sx(styles.description)}
              />
            </div>
            {inlineAction ? (
              <ToastAction render={<Button size="sm" variant="secondary" />} />
            ) : null}
            <ToastClose
              {...themeSlotProps("toast", "close")}
              className={sx(
                surfaceChrome.quietIconButton,
                controlSquares.sm,
                focusRing.ring,
              )}
              aria-label="Dismiss toast"
              // Same close contract as Popover/Dialog: a 16px glyph in the 32px
              // quiet square. It shipped at 14px, so the identical-looking
              // button read weaker here than on every other overlay surface.
              data-ads-control-icon-button="true"
              style={
                {
                  "--ads-control-icon-size": controlIconSizes.md,
                } as React.CSSProperties
              }
            >
              <X aria-hidden />
            </ToastClose>
          </div>
          {hasAction && hasDescription ? (
            <div className={sx(styles.actionRow)}>
              <ToastAction render={<Button size="sm" variant="secondary" />} />
            </div>
          ) : null}
        </ToastContent>
      </ToastRoot>
    );
  });
}
