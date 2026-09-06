import * as stylex from "@stylexjs/stylex";
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
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Button } from "./Button";
import { Loader } from "./Loader";
import { runToastPromise, type ToastPromiseApi } from "./ToastHost.promise";

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
  toastManager?: ToastProviderProps["toastManager"];
  /** Max stacked toasts before older ones fold away. @default 3 */
  limit?: ToastProviderProps["limit"];
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
  toastManager,
  limit = 3,
  position = "bottom-right",
  timeout = DEFAULT_TOAST_TIMEOUT_MS,
}: ToastHostProps) {
  const { horizontal, isTop, swipe } = resolvePosition(position);

  return (
    <ToastProvider limit={limit} timeout={timeout} toastManager={toastManager}>
      {children}
      <ToastPortal>
        <ToastViewport
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
    // makes the toast multi-line, the action drops to a bottom-end row so it
    // never floats mid-card. The close affordance stays in its own trailing
    // column (top-aligned when multi-line), so it never collides with the
    // action.
    const hasAction = Boolean(toast.actionProps);
    const hasDescription = Boolean(toast.description);
    const inlineAction = hasAction && !hasDescription;

    return (
      <ToastRoot
        className={(state) =>
          cx(
            sx(
              styles.toast,
              isTop ? styles.toastTop : styles.toastBottom,
              state.limited && styles.toastLimited,
            ),
            "atelier-toast-stack",
            isTop && "atelier-toast-stack-top",
          )
        }
        key={toast.id}
        swipeDirection={swipe}
        toast={toast}
      >
        <ToastContent
          className={sx(
            styles.content,
            hasDescription && styles.contentMultiline,
          )}
        >
          {tone === "loading" ? (
            <span
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
            // when a description makes the toast multi-line the row top-aligns,
            // and the slot is what carries the title's line box so the glyph
            // can be centred on it by flex alignment (see `iconMultiline`).
            <span
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
            <ToastTitle className={sx(styles.title)} />
            <ToastDescription className={sx(styles.description)} />
            {hasAction && hasDescription ? (
              <div className={sx(styles.actionRow)}>
                <ToastAction
                  render={<Button size="sm" variant="secondary" />}
                />
              </div>
            ) : null}
          </div>
          {inlineAction ? (
            <ToastAction render={<Button size="sm" variant="secondary" />} />
          ) : null}
          <ToastClose
            className={sx(
              surfaceChrome.quietIconButton,
              controlSquares.sm,
              focusRing.ring,
            )}
            aria-label="Dismiss toast"
            // Same close contract as Popover/Dialog: a 16px glyph in the 32px
            // quiet square. It shipped at 14px, so the identical-looking button
            // read weaker here than on every other overlay surface.
            data-ads-control-icon-button="true"
            style={
              {
                "--ads-control-icon-size": controlIconSizes.md,
              } as React.CSSProperties
            }
          >
            <X aria-hidden />
          </ToastClose>
        </ToastContent>
      </ToastRoot>
    );
  });
}

const styles = stylex.create({
  viewport: {
    inlineSize: `min(360px, calc(100dvw - ${vars.space32}))`,
    position: "fixed",
    zIndex: vars.zIndexToast,
  },
  viewportTop: {
    insetBlockStart: vars.space20,
  },
  viewportBottom: {
    insetBlockEnd: vars.space20,
  },
  viewportLeft: {
    insetInlineStart: vars.space20,
  },
  viewportRight: {
    insetInlineEnd: vars.space20,
  },
  viewportCenter: {
    insetInlineStart: "50%",
    transform: "translateX(-50%)",
  },
  toast: {
    backgroundColor: vars.colorSurfaceRaised,
    blockSize: "var(--toast-height)",
    borderColor: vars.colorMediaEdge,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // elevation4 — a toast is a detached global surface: it sits on the highest
    // z band (`zIndexToast`) precisely so feedback is never occluded, and it
    // floats over whatever is already on screen. elevation3 gave it a
    // dropdown's depth (tokens.stylex.ts elevation policy).
    boxShadow: vars.elevationModal,
    color: vars.colorText,
    inlineSize: "100%",
    overflow: "hidden",
    position: "absolute",
    // Stacking transform + transitions live in `.atelier-toast-stack` (+`-top`).
    userSelect: "none",
  },
  toastBottom: {
    insetBlockEnd: 0,
    insetInlineEnd: 0,
    insetInlineStart: "auto",
    transformOrigin: "bottom center",
  },
  toastTop: {
    insetBlockStart: 0,
    insetInlineEnd: 0,
    insetInlineStart: "auto",
    transformOrigin: "top center",
  },
  toastLimited: {
    opacity: 0,
  },
  // Flex row: [icon?] [copy 1fr] [inline action?] [close]. Single-line
  // toasts center everything; multi-line toasts top-align the trailing
  // chrome and push the action into a bottom-end row inside the copy.
  content: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  contentMultiline: {
    alignItems: "flex-start",
  },
  // Tone reads from the icon (neutral card), matching Alert/Banner. The slot is
  // a centring box so the glyph never needs a hand nudge.
  icon: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
  },
  iconMultiline: {
    // A multi-line toast top-aligns its row, so the glyph must centre on the
    // title's FIRST line box, not on the whole card. Giving the slot exactly
    // that line box (title font size × its line height) and letting flex centre
    // the glyph inside it replaces the banned `marginBlockStart: 1` optical
    // nudge — and it now tracks the type scale instead of one hard-coded pixel.
    alignSelf: "start",
    blockSize: `calc(${vars.fontSizeBody} * ${vars.lineHeightTight})`,
  },
  iconInfo: { color: vars.colorInfo },
  iconLoading: { color: vars.colorTextMuted },
  iconSuccess: { color: vars.colorSuccess },
  iconWarning: { color: vars.colorWarning },
  iconDanger: { color: vars.colorDanger },
  copy: {
    display: "grid",
    flexGrow: 1,
    flexShrink: 1,
    gap: vars.space4,
    minInlineSize: 0,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightTight,
    margin: 0,
  },
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    margin: 0,
  },
  // Bottom-end action row for multi-line toasts (toast-stack anatomy).
  actionRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginBlockStart: vars.space8,
  },
});

const toneIconStyles = {
  danger: styles.iconDanger,
  info: styles.iconInfo,
  loading: styles.iconLoading,
  success: styles.iconSuccess,
  warning: styles.iconWarning,
} as const;
