import * as stylex from "@stylexjs/stylex";
import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import type * as React from "react";

import { controlHeights, controlSquares } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import {
  useOptionalSidebar,
  useOptionalSidebarLayout,
  useSidebar,
} from "./sidebar-context";

/**
 * The rail's leaf utilities: the raw field, the search slot built on it, the
 * group divider, and the drag rail. Split out of `AppShell.tsx` to keep that
 * file under the source-structure size limit; every export is re-exported from
 * `./AppShell`, so no import path changes.
 */

export type SidebarInputProps = React.ComponentProps<"input">;

export function SidebarInput({ className, ...props }: SidebarInputProps) {
  const sidebarLayout = useOptionalSidebarLayout();

  return (
    <input
      {...props}
      className={cx(
        sx(
          styles.sidebarInput,
          // Height comes from the shared control-metric map so the field sits
          // on the rail's own row rhythm (32px compact / 36px comfortable) and
          // picks up the `(pointer: coarse)` 44px bump. The base rule used to
          // hard-code `minBlockSize: controlHeightMd`, which left a 36px field
          // stacked against 32px nav rows and skipped the touch bump entirely.
          sidebarLayout?.density === "compact"
            ? controlHeights.sm
            : controlHeights.md,
          focusRing.ring,
          sidebarLayout?.collapsed && styles.sidebarInputCollapsed,
        ),
        className,
      )}
    />
  );
}

export type SidebarSearchProps = Omit<
  React.ComponentProps<"input">,
  "onChange" | "type" | "value"
> & {
  /** Accessible name (and collapsed-icon tooltip). @default "Search" */
  label?: string;
  /**
   * Press handler for the collapsed icon button (e.g. open a search dialog).
   * Default: expand the sidebar and focus the search input.
   */
  onOpen?: () => void;
  onValueChange?: (value: string) => void;
  /** Trailing hint (keyboard shortcut). Hidden while collapsed. */
  shortcut?: React.ReactNode;
  value?: string;
};

/**
 * Sidebar search slot. Expanded it renders a real search input (leading
 * glyph, optional trailing `shortcut` hint); collapsed to the icon rail it
 * becomes an icon button — by default it expands the sidebar and moves focus
 * into the input, or calls `onOpen` for apps whose search lives in a dialog.
 * No more faking search as a nav row to survive the collapsed state.
 *
 * Belongs in the CONTENT region, not stacked inside `header`: everything in
 * `header` shares the one grid track the collapse trigger narrows, so a
 * header-stacked field renders permanently short of the rail's width.
 */
export function SidebarSearch({
  className,
  label = "Search",
  onOpen,
  onValueChange,
  placeholder,
  shortcut,
  value,
  ...props
}: SidebarSearchProps) {
  const sidebar = useOptionalSidebar();
  const sidebarLayout = useOptionalSidebarLayout();
  const collapsed = Boolean(sidebarLayout?.collapsed);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusAfterExpandRef = useRef(false);
  const compact = sidebarLayout?.density === "compact";

  // The input mounts only after the expand re-render, so focus lands via an
  // effect instead of a timer race.
  useEffect(() => {
    if (!collapsed && focusAfterExpandRef.current) {
      focusAfterExpandRef.current = false;
      inputRef.current?.focus();
    }
  }, [collapsed]);

  if (collapsed) {
    return (
      <button
        aria-label={label}
        className={cx(
          sx(
            styles.sidebarSearchCollapsedButton,
            compact ? controlHeights.sm : controlHeights.md,
            compact ? controlSquares.sm : controlSquares.md,
            focusRing.ring,
          ),
          className,
        )}
        onClick={() => {
          if (onOpen) {
            onOpen();
            return;
          }
          focusAfterExpandRef.current = true;
          if (sidebar?.isMobile) {
            sidebar.setOpenMobile(true);
          } else {
            sidebar?.setOpen(true);
          }
        }}
        title={label}
        type="button"
      >
        <Search aria-hidden size={16} />
      </button>
    );
  }

  return (
    <div className={sx(styles.sidebarSearch)}>
      <Search aria-hidden className={sx(styles.sidebarSearchIcon)} size={14} />
      <input
        {...props}
        aria-label={props["aria-label"] ?? label}
        className={cx(
          sx(
            styles.sidebarInput,
            compact ? controlHeights.sm : controlHeights.md,
            styles.sidebarSearchInput,
            focusRing.ring,
          ),
          className,
        )}
        onChange={(event) => onValueChange?.(event.target.value)}
        placeholder={placeholder ?? label}
        ref={inputRef}
        type="search"
        value={value}
      />
      {shortcut != null ? (
        <span aria-hidden className={sx(styles.sidebarSearchShortcut)}>
          {shortcut}
        </span>
      ) : null}
    </div>
  );
}

export type SidebarSeparatorProps = React.ComponentProps<"div">;

export function SidebarSeparator({
  className,
  role = "separator",
  ...props
}: SidebarSeparatorProps) {
  return (
    <div
      {...props}
      className={cx(sx(styles.sidebarSeparator), className)}
      role={role}
    />
  );
}

export type SidebarRailProps = React.ComponentProps<"button">;

export function SidebarRail({
  "aria-label": ariaLabel,
  className,
  onClick,
  type = "button",
  ...props
}: SidebarRailProps) {
  const sidebar = useSidebar();
  const sidebarLayout = useOptionalSidebarLayout();
  const expanded = sidebar.isMobile ? sidebar.openMobile : sidebar.open;

  return (
    <button
      {...props}
      aria-label={
        ariaLabel ??
        (expanded ? "Collapse sidebar rail" : "Expand sidebar rail")
      }
      aria-controls={sidebar.sidebarId}
      aria-expanded={expanded}
      className={cx(
        sx(
          styles.sidebarRail,
          sidebarLayout?.side === "right" && styles.sidebarRailRight,
        ),
        className,
      )}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          sidebar.toggleSidebar();
        }
      }}
      type={type}
    />
  );
}

const styles = stylex.create({
  sidebarInput: {
    appearance: "none",
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorText,
    fontFamily: "inherit",
    fontSize: vars.fontSizeBody,
    inlineSize: "100%",
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
    paddingBlock: 0,
    paddingInline: vars.space12,
    "::placeholder": {
      color: vars.colorTextPlaceholder,
    },
  },
  sidebarInputCollapsed: {
    display: "none",
  },
  sidebarSearch: {
    alignItems: "center",
    display: "flex",
    minInlineSize: 0,
    position: "relative",
  },
  sidebarSearchIcon: {
    color: vars.colorTextSubtle,
    insetInlineStart: vars.space12,
    pointerEvents: "none",
    position: "absolute",
  },
  sidebarSearchInput: {
    // Native search-cancel duplicates the ADS clear affordances; hide it so
    // the field matches SearchField's quiet anatomy.
    "::-webkit-search-cancel-button": {
      display: "none",
    },
    paddingInlineEnd: vars.space12,
    // Clear the absolutely-positioned 14px glyph: space12 inset (12) + icon
    // (14) + space8 breathing room (8). `space24` (24px) landed the
    // placeholder on top of the icon.
    paddingInlineStart: 34,
  },
  sidebarSearchShortcut: {
    color: vars.colorTextSubtle,
    fontSize: vars.fontSizeCaption,
    insetInlineEnd: vars.space12,
    lineHeight: vars.lineHeightTight,
    pointerEvents: "none",
    position: "absolute",
    whiteSpace: "nowrap",
  },
  sidebarSearchCollapsedButton: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
    borderRadius: vars.radiusControl,
    borderWidth: 0,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    cursor: "pointer",
    display: "inline-flex",
    justifyContent: "center",
    marginInline: "auto",
  },
  sidebarSeparator: {
    backgroundColor: vars.colorBorder,
    blockSize: 1,
    inlineSize: "100%",
    marginBlock: vars.space4,
  },
  sidebarRail: {
    appearance: "none",
    // Focus is an accent bar, not an outline — the same answer
    // `ResizablePanel`'s `handleRail` gives for the same shape. A drag rail is
    // 8px wide and full-height inside a `sidebar` that must keep
    // `overflow: hidden` for its collapse transition, so an outline ring has
    // nowhere to paint on ANY side: it was 100% invisible here, on a control
    // that is `tabIndex`-reachable and carries `aria-expanded`.
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorBorder,
      ":focus-visible": vars.colorAccent,
      // Forced colors discards author backgrounds, so the accent bar — the ONLY
      // focus cue on this control — would disappear in High Contrast Mode. Same
      // escape the ring recipe uses for `outlineColor`: name a system color.
      "@media (forced-colors: active)": {
        default: "transparent",
        ":focus-visible": "Highlight",
      },
    },
    borderWidth: 0,
    blockSize: "100%",
    cursor: "pointer",
    // No outline, and said explicitly: dropping `focusRing.ring` here would
    // otherwise hand the control back to the UA's own 1px ring, which is
    // clipped by the same `overflow: hidden` and equally invisible.
    outlineStyle: "none",
    inlineSize: 8,
    insetBlock: 0,
    // Flush with the sidebar's trailing edge, inside its own clip. `-4` was
    // written to straddle that edge, but the shell it sits in is
    // `overflow: hidden`: the outer half was never painted AND never hit-tested,
    // so the "8px" grab strip was a 4px one. Logical, not `right`: the trailing
    // edge is screen-left under RTL.
    insetInlineEnd: 0,
    padding: 0,
    position: "absolute",
    // In-surface chrome: the resize rail sits over the sidebar's own edge, not
    // over other surfaces. Tokenized (was a raw `zIndex: 1`).
    zIndex: vars.zIndexSticky,
  },
  sidebarRailRight: {
    insetInlineEnd: "auto",
    insetInlineStart: 0,
  },
});

