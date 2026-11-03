import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useLayoutEffect, useRef } from "react";
import type * as React from "react";

import { useAtelierMotion } from "../motion/useAtelierMotion";
import {
  type ControlScale,
  controlHeights,
  controlIconSizes,
} from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { springSnappy, vars } from "../tokens/tokens.stylex";
import { themeProps, themeTargetClassName } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { FilterClearAll } from "./AppliedFilters.clear";

export type AppliedFilter = {
  /** Stable identity for the chip (list key + removal target). */
  id: string;
  /** Property being filtered, e.g. "Status" (rendered muted). */
  property: React.ReactNode;
  /** Comparison operator, e.g. "is" / "is not" (rendered muted: it carries the meaning). */
  operator: React.ReactNode;
  /** Filter value, e.g. "In progress" (rendered medium weight). */
  value: React.ReactNode;
};

export type FilterChipProps = {
  filter: AppliedFilter;
  /**
   * Open the app's own editor for this filter (the chip body is
   * clickable). Omit to render the body as static text.
   */
  onEdit?: (id: string) => void;
  /** Remove this filter. Also fired by Backspace/Delete while the chip has focus. */
  onRemove: (id: string) => void;
  /**
   * Accessible label for the remove button. Defaults to
   * "Remove filter: {property} {operator} {value}" when all three are plain
   * text, otherwise "Remove filter".
   */
  removeLabel?: string;
  /** Shared control scale. Defaults to `sm`. */
  size?: ControlScale;
} & XstyleProp;

const isPlainText = (node: React.ReactNode): node is string | number =>
  typeof node === "string" || typeof node === "number";

/**
 * Name the filter in the ✕ label, so a bar of three chips does not announce
 * three identical "Remove filter" buttons. Node parts have no
 * reliable text, so they fall back to the generic label.
 */
function defaultRemoveLabel({ operator, property, value }: AppliedFilter) {
  return isPlainText(property) && isPlainText(operator) && isPlainText(value)
    ? i18n.t("ui:appliedFilters.removeNamed", { property, operator, value })
    : i18n.t("ui:appliedFilters.remove");
}

/**
 * A single applied-filter token (filter-formula anatomy:
 * property · operator · value · remove). Keyboard-first: pressing
 * Backspace or Delete anywhere inside the chip removes it.
 *
 * JS motion layer: chips enter/exit with a spring scale+fade (Motion owns
 * `transform` on the chip). Reduced motion (or no provider) falls back to an
 * instant opacity swap; `AppliedFilters` wraps the list in `AnimatePresence`
 * so removals play out before unmount.
 */
export function FilterChip({
  filter,
  onEdit,
  onRemove,
  removeLabel,
  size = "sm",
  xstyle,
}: FilterChipProps) {
  useTranslation();
  const { reduceMotion } = useAtelierMotion();
  const theme = themeProps("filter-chip", { size });
  const body = (
    <>
      <span className={sx(styles.property)}>{filter.property}</span>
      <span className={sx(styles.operator)}>{filter.operator}</span>
      <span className={sx(styles.value)}>{filter.value}</span>
    </>
  );

  return (
    <m.span
      animate={{ opacity: 1, scale: 1 }}
      {...theme}
      className={cx(
        sx(styles.chip, controlHeights[size], xstyle),
        theme.className,
      )}
      data-filter-chip-id={filter.id}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      transition={reduceMotion ? { duration: 0 } : springSnappy}
      onKeyDown={(event) => {
        // Chip-level so removal works whether focus sits on the edit body or
        // the remove button — the "backspace deletes the filter" feel.
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          onRemove(filter.id);
        }
      }}
    >
      {onEdit ? (
        <button
          className={cx(
            sx(styles.editBody, focusRing.ring, focusRing.ringInset),
            themeTargetClassName("filter-chip-edit"),
          )}
          onClick={() => onEdit(filter.id)}
          type="button"
        >
          {body}
        </button>
      ) : (
        <span className={sx(styles.staticBody)}>{body}</span>
      )}
      <button
        aria-label={removeLabel ?? defaultRemoveLabel(filter)}
        className={cx(
          sx(styles.remove, focusRing.ring, focusRing.ringInset),
          themeTargetClassName("filter-chip-remove"),
        )}
        onClick={() => onRemove(filter.id)}
        type="button"
      >
        <X aria-hidden size={controlIconSizes[size]} />
      </button>
    </m.span>
  );
}

export type AppliedFiltersProps = Omit<
  React.ComponentProps<"div">,
  "onChange"
> & {
  /**
   * Slot for the app's own "add filter" affordance (a `Menu`/`Combobox`
   * trigger). The bar is presentational and never owns the picker.
   */
  addFilter?: React.ReactNode;
  /** Accessible label for the applied-filters group. Defaults to "Filters". */
  clearAllLabel?: React.ReactNode;
  filters: AppliedFilter[];
  label?: string;
  /** Render "Clear all" when provided and at least one filter is applied. */
  onClearAll?: () => void;
  /** Open the app's editor for a chip; omit for static (remove-only) chips. */
  onEdit?: (id: string) => void;
  onRemove: (id: string) => void;
  /** Shared control scale. Defaults to `sm`. */
  size?: ControlScale;
} & XstyleProp;

/**
 * Applied-filters bar (filter-formula anatomy). Purely presentational: it
 * renders the current filter chips in a horizontally scrollable row and emits
 * `onRemove`/`onEdit`/`onClearAll` — the app supplies its own add-filter
 * picker through the `addFilter` slot. Backspace on a focused chip removes it.
 */
export function AppliedFilters({
  addFilter,
  className,
  clearAllLabel = i18n.t("ui:appliedFilters.clearAll"),
  filters,
  label = i18n.t("ui:appliedFilters.label"),
  onClearAll,
  onEdit,
  onRemove,
  size = "sm",
  xstyle,
  ...props
}: AppliedFiltersProps) {
  useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const addSlotRef = useRef<HTMLDivElement>(null);
  // Captured on every removal (keyboard or mouse) so the layout effect below
  // can resolve where focus should land once the removed chip's id has
  // actually dropped out of `filters` — the chip lingers in the DOM through
  // its `AnimatePresence` exit animation, so this cannot be resolved
  // synchronously inside the click/keydown handler.
  const pendingFocusRef = useRef<{
    prevIds: string[];
    removedId: string;
  } | null>(null);

  const handleRemove = useCallback(
    (id: string) => {
      pendingFocusRef.current = {
        prevIds: filters.map((filter) => filter.id),
        removedId: id,
      };
      onRemove(id);
    },
    [filters, onRemove],
  );

  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) {
      return;
    }
    const remainingIds = new Set(filters.map((filter) => filter.id));
    if (remainingIds.has(pending.removedId)) {
      // Not removed yet in this render (e.g. the parent hasn't committed the
      // change) — wait for the `filters` update that actually drops it.
      return;
    }
    pendingFocusRef.current = null;

    const { prevIds, removedId } = pending;
    const removedIndex = prevIds.indexOf(removedId);
    let targetId: string | undefined;
    for (let i = removedIndex + 1; i < prevIds.length; i += 1) {
      const id = prevIds[i];
      if (id !== undefined && remainingIds.has(id)) {
        targetId = id;
        break;
      }
    }
    if (targetId === undefined) {
      for (let i = removedIndex - 1; i >= 0; i -= 1) {
        const id = prevIds[i];
        if (id !== undefined && remainingIds.has(id)) {
          targetId = id;
          break;
        }
      }
    }

    if (targetId !== undefined) {
      scrollerRef.current
        ?.querySelector<HTMLElement>(
          `[data-filter-chip-id="${targetId}"] button`,
        )
        ?.focus();
      return;
    }

    // No chips remain: the add-filter slot's own trigger, else the bar root.
    const addSlotFocusable =
      addSlotRef.current?.querySelector<HTMLElement>("button, [href]");
    if (addSlotFocusable) {
      addSlotFocusable.focus();
      return;
    }
    rootRef.current?.focus();
  }, [filters]);

  const theme = themeProps("applied-filters");

  return (
    <div
      tabIndex={-1}
      {...props}
      {...theme}
      aria-label={label}
      className={cx(sx(styles.root, xstyle), theme.className, className)}
      ref={rootRef}
      role="group"
    >
      <div className={sx(styles.scroller)} ref={scrollerRef}>
        {addFilter ? (
          <div className={sx(styles.addSlot)} ref={addSlotRef}>
            {addFilter}
          </div>
        ) : null}
        {/* initial={false}: the pre-existing set never animates on first
            paint — only chips added/removed afterwards play enter/exit. */}
        <AnimatePresence initial={false}>
          {filters.map((filter) => (
            <FilterChip
              filter={filter}
              key={filter.id}
              onEdit={onEdit}
              onRemove={handleRemove}
              size={size}
            />
          ))}
        </AnimatePresence>
      </div>
      {onClearAll && filters.length > 0 ? (
        <FilterClearAll onClick={onClearAll} size={size}>
          {clearAllLabel}
        </FilterClearAll>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    inlineSize: "100%",
    minInlineSize: 0,
  },
  scroller: {
    alignItems: "center",
    display: "flex",
    flex: "1 1 auto",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
    overflowX: "auto",
  },
  addSlot: {
    flexShrink: 0,
  },
  chip: {
    alignItems: "stretch",
    // Warm tint + hairline: quiet token, not a solid gray fill (house rule).
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  editBody: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--ads-color-overlay-hover"],
        ":active": vars["--ads-color-overlay-pressed"],
      },
    },
    borderWidth: 0,
    color: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    lineHeight: vars["--ads-line-height-tight"],
    paddingBlock: 0,
    paddingInline: vars["--ads-space-8"],
  },
  staticBody: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--ads-space-4"],
    paddingBlock: 0,
    paddingInline: vars["--ads-space-8"],
  },
  property: {
    color: vars["--ads-color-text-muted"],
  },
  operator: {
    color: vars["--ads-color-text-muted"],
  },
  value: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  remove: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--ads-color-overlay-hover"],
        ":active": vars["--ads-color-overlay-pressed"],
      },
    },
    borderInlineStartColor: vars["--ads-color-border-subtle"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars["--ads-border-width-hairline"],
    borderWidth: 0,
    color: {
      default: vars["--ads-color-text-muted"],
      "@media (hover: hover)": {
        default: vars["--ads-color-text-muted"],
        ":hover": vars["--ads-color-text"],
      },
    },
    cursor: "pointer",
    display: "inline-flex",
    justifyContent: "center",
    paddingBlock: 0,
    paddingInline: vars["--ads-space-4"],
  },
});
