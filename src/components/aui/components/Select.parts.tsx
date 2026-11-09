import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type * as React from "react";

import {
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel,
  SelectList,
  SelectPopup,
  SelectPortal,
  SelectPositioner,
  SelectRoot,
  SelectScrollDownArrow,
  SelectScrollUpArrow,
  SelectTrigger,
  SelectValue,
} from "../headless/select";
import { controlChrome } from "../recipes/control-chrome";
import type { ControlScale } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { listbox } from "../recipes/listbox";
import { transition } from "../recipes/transition";
import {
  PortalProductThemeScope,
  usePortalProductThemeProps,
} from "../theming/ProductThemeProvider";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import {
  POPUP_SIDE_OFFSET,
  type PopupPlacement,
  resolvePlacement,
} from "../utils/placement";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  itemStylesBySize,
  styles,
  triggerHeightsBySize,
  triggerStylesBySize,
} from "../recipes/select-styles";
import { mergeClassName } from "./merge-class-name";

// Base UI parts not yet re-exported by `headless/select`. Imported directly so
// the styled compound layer can wrap them without editing the headless module.
const SelectGroupPart = BaseSelect.Group;
const SelectGroupLabelPart = BaseSelect.GroupLabel;
const SelectSeparatorPart = BaseSelect.Separator;

/**
 * The compound (compositional) half of `Select` —
 * `<Select.Root>…<Select.Trigger render={…}/>…</Select.Root>`. The array
 * convenience API is `Select.array`; the root that joins the two into one
 * export is `Select`. Split on the seam the file already documented so neither
 * module outgrows the source-size cap.
 */

/**
 * Scale for the trigger: xs 28px / sm 32px / md 36px (default) / lg 40px.
 * Option rows remain on the shared menu metric.
 */
export type SelectSize = ControlScale;

// ---------------------------------------------------------------------------
// Compound parts (primary, compositional API)
// ---------------------------------------------------------------------------

export type SelectRootCompoundProps = React.ComponentProps<typeof SelectRoot>;

function Root(props: SelectRootCompoundProps) {
  return <SelectRoot {...props} />;
}

export type SelectLabelProps = React.ComponentProps<typeof SelectLabel> &
  XstyleProp;

function CompoundLabel({ className, xstyle, ...props }: SelectLabelProps) {
  const theme = themeProps("select-label");
  return (
    <SelectLabel
      {...props}
      {...theme}
      className={mergeClassName(
        () => cx(sx(styles.label, xstyle), theme.className) ?? "",
        className,
      )}
    />
  );
}

export type SelectTriggerProps = React.ComponentProps<typeof SelectTrigger> & {
  /** Tints the border with the invalid tone. Composed here, not by a caller's
   * `className`: the package's own classes win on CSS source order. */
  invalid?: boolean;
  /**
   * The value is settled and cannot be changed here — a locked assignee, a field
   * the caller's role may read but not edit.
   *
   * It is NOT `disabled`: a disabled control is unavailable, a read-only one is
   * simply not yours to change, and the two must not look alike. This composes
   * `controlChrome.readOnlyField`, the same chrome `TextField`, `Textarea`,
   * `NumberField`, `InputGroup`, `Field` and `DatePicker` already use, so the
   * whole field family says it one way. Until now a read-only Select rendered
   * pixel-identical to an editable one.
   */
  readOnly?: boolean;
  size?: SelectSize;
} & XstyleProp;

function Trigger({
  className,
  invalid = false,
  readOnly = false,
  size: resolvedSize = "md",
  xstyle,
  ...props
}: SelectTriggerProps) {
  const theme = themeProps("select-trigger", { size: resolvedSize });
  return (
    <SelectTrigger
      {...props}
      {...theme}
      aria-readonly={readOnly || undefined}
      /*
       * A read-only Select does not open. Blocking the pointer/keyboard here
       * rather than passing `disabled` keeps the control focusable and its value
       * announced — the difference between "not yours to change" and "unavailable".
       */
      onPointerDown={
        readOnly
          ? (event) => {
              // Base UI opens the popup on pointer DOWN, so intercepting click
              // was measurably too late — the listbox was already mounted.
              event.preventDefault();
              props.onPointerDown?.(event);
            }
          : props.onPointerDown
      }
      onKeyDown={
        readOnly
          ? (event) => {
              if (
                event.key === "Enter" ||
                event.key === " " ||
                event.key === "ArrowDown"
              ) {
                event.preventDefault();
              }
              props.onKeyDown?.(event);
            }
          : props.onKeyDown
      }
      className={mergeClassName(
        (state) =>
          cx(
            sx(
              styles.trigger,
              triggerStylesBySize[resolvedSize],
              controlChrome.trigger,
              controlChrome.triggerFocusBorder,
              // A Select is field-shaped, so it answers the pointer the way a
              // TextField does: the boundary strengthens, the fill holds still.
              // `trigger`'s background wash made it the one control in the form
              // row that lit up like a button under the pointer. Composed after
              // both so its fill and its border win; `trigger`'s elevation and
              // press collapse are untouched.
              controlChrome.field,
              transition.colors,
              focusRing.borderOnly,
              triggerHeightsBySize[resolvedSize],
              state.open && styles.triggerOpen,
              // `Select`'s value is still information while disabled (like a
              // disabled `TextField`), so it tints and mutes instead of fading —
              // `controlChrome.disabledField`, not the opacity-fade
              // `controlChrome.disabled` every other pressable trigger uses.
              // Composed last so its plain `cursor`/background/border/color
              // beat `styles.trigger`/`controlChrome.trigger`'s; the native
              // `disabled` attribute on this button (Base UI's `nativeButton`)
              // already keeps `:hover`/`:active` from ever matching.
              // After `controlChrome.trigger`'s border so the tone wins, before
              // `disabledField` so a disabled control still reads as disabled.
              invalid && styles.triggerError,
              state.disabled && controlChrome.disabledField,
              // After `disabledField`: a control that is both disabled and
              // read-only is disabled first, and reads that way.
              readOnly && !state.disabled && controlChrome.readOnlyField,
              xstyle,
            ),
            theme.className,
          ) ?? "",
        className,
      )}
    />
  );
}

export type SelectValueProps = React.ComponentProps<typeof SelectValue> &
  XstyleProp;

function Value({ className, xstyle, ...props }: SelectValueProps) {
  return (
    <SelectValue
      {...props}
      {...themeSlotProps("select-trigger", "value")}
      className={mergeClassName(() => sx(styles.value, xstyle), className)}
    />
  );
}

export type SelectIconProps = React.ComponentProps<typeof SelectIcon> &
  XstyleProp;

function Icon({ children, className, xstyle, ...props }: SelectIconProps) {
  return (
    <SelectIcon
      {...props}
      {...themeSlotProps("select-trigger", "icon")}
      className={mergeClassName(() => sx(styles.icon, xstyle), className)}
    >
      {children ?? <ChevronDown aria-hidden size={16} />}
    </SelectIcon>
  );
}

export type SelectPortalProps = React.ComponentProps<typeof SelectPortal>;

function Portal({ children, ...props }: SelectPortalProps) {
  return (
    <SelectPortal {...props}>
      <PortalProductThemeScope>{children}</PortalProductThemeScope>
    </SelectPortal>
  );
}

export type SelectPositionerProps = React.ComponentProps<
  typeof SelectPositioner
> & {
  /** Where the list opens against its trigger. @default "bottom-start" */
  placement?: PopupPlacement;
} & XstyleProp;

function Positioner({
  align,
  alignItemWithTrigger = false,
  className,
  placement,
  side,
  sideOffset = POPUP_SIDE_OFFSET,
  xstyle,
  ...props
}: SelectPositionerProps) {
  const resolved = resolvePlacement(placement);
  return (
    <SelectPositioner
      {...props}
      align={align ?? resolved.align}
      /*
       * Off by default. Base UI ships it on, which anchors the list so the
       * SELECTED option covers the trigger — measured, the popup opened 36px
       * ABOVE the field's bottom edge, overlapping it. Every other popup in the
       * family (Combobox, Menu, Popover, DatePicker) sits below its anchor at
       * `POPUP_SIDE_OFFSET`, and a Select is field-shaped like them. Callers
       * that want the native-select behaviour can pass it back.
       */
      alignItemWithTrigger={alignItemWithTrigger}
      className={mergeClassName(() => sx(styles.positioner, xstyle), className)}
      side={side ?? resolved.side}
      sideOffset={sideOffset}
    />
  );
}

export type SelectPopupProps = React.ComponentProps<typeof SelectPopup> &
  XstyleProp;

function Popup({ className, xstyle, ...props }: SelectPopupProps) {
  const theme = themeProps("select-popup");
  // The list leaves its provider's DOM subtree through the portal, so it has to
  // carry the brand with it: `@scope` is a fact about the DOM tree, and a
  // portal is exactly where the DOM tree and the React tree disagree.
  const portalTheme = usePortalProductThemeProps();
  return (
    <SelectPopup
      {...props}
      {...portalTheme}
      {...theme}
      className={mergeClassName(
        () =>
          cx(
            sx(styles.popup, listbox.popupWidth, xstyle),
            theme.className,
            "atelier-motion-dropdown",
          ) ?? "",
        className,
      )}
    />
  );
}

export type SelectListProps = React.ComponentProps<typeof SelectList> &
  XstyleProp;

function List({ className, xstyle, ...props }: SelectListProps) {
  return (
    <SelectList
      {...props}
      {...themeSlotProps("select-popup", "list")}
      className={mergeClassName(() => sx(listbox.list, xstyle), className)}
    />
  );
}

export type SelectItemProps = React.ComponentProps<typeof SelectItem> & {
  size?: SelectSize;
} & XstyleProp;

function Item({
  className,
  size: resolvedSize = "md",
  xstyle,
  ...props
}: SelectItemProps) {
  const theme = themeProps("select-item", { size: resolvedSize });
  return (
    <SelectItem
      {...props}
      {...theme}
      className={mergeClassName(
        (state) =>
          cx(
            sx(
              styles.item,
              transition.colors,
              itemStylesBySize[resolvedSize],
              state.highlighted && styles.itemHighlighted,
              state.selected && styles.itemSelected,
              state.disabled && styles.itemDisabled,
              xstyle,
            ),
            theme.className,
          ) ?? "",
        className,
      )}
    />
  );
}

export type SelectItemTextProps = React.ComponentProps<typeof SelectItemText> &
  XstyleProp;

function ItemText({ className, xstyle, ...props }: SelectItemTextProps) {
  return (
    <SelectItemText
      {...props}
      {...themeSlotProps("select-item", "text")}
      className={mergeClassName(() => sx(styles.itemText, xstyle), className)}
    />
  );
}

export type SelectItemIndicatorProps = React.ComponentProps<
  typeof SelectItemIndicator
> &
  XstyleProp;

function ItemIndicator({
  children,
  className,
  keepMounted = true,
  xstyle,
  ...props
}: SelectItemIndicatorProps) {
  return (
    <SelectItemIndicator
      {...props}
      {...themeSlotProps("select-item", "indicator")}
      className={mergeClassName(
        (state) =>
          sx(
            styles.itemIndicator,
            !state.selected && styles.itemIndicatorHidden,
            xstyle,
          ),
        className,
      )}
      keepMounted={keepMounted}
    >
      {children ?? <Check aria-hidden size={14} />}
    </SelectItemIndicator>
  );
}

export type SelectGroupProps = React.ComponentProps<typeof SelectGroupPart>;

function Group(props: SelectGroupProps) {
  return <SelectGroupPart {...props} />;
}

export type SelectGroupLabelProps = React.ComponentProps<
  typeof SelectGroupLabelPart
> &
  XstyleProp;

function GroupLabel({ className, xstyle, ...props }: SelectGroupLabelProps) {
  return (
    <SelectGroupLabelPart
      {...props}
      {...themeSlotProps("select-popup", "group-label")}
      className={mergeClassName(() => sx(styles.groupLabel, xstyle), className)}
    />
  );
}

export type SelectSeparatorProps = React.ComponentProps<
  typeof SelectSeparatorPart
> &
  XstyleProp;

function Separator({ className, xstyle, ...props }: SelectSeparatorProps) {
  return (
    <SelectSeparatorPart
      {...props}
      {...themeSlotProps("select-popup", "separator")}
      className={mergeClassName(() => sx(styles.separator, xstyle), className)}
    />
  );
}

export type SelectScrollUpArrowProps = React.ComponentProps<
  typeof SelectScrollUpArrow
> &
  XstyleProp;

function ScrollUpArrow({
  children,
  className,
  xstyle,
  ...props
}: SelectScrollUpArrowProps) {
  return (
    <SelectScrollUpArrow
      {...props}
      {...themeSlotProps("select-popup", "scroll-up-arrow")}
      className={mergeClassName(
        () => sx(styles.scrollArrow, styles.scrollArrowUp, xstyle),
        className,
      )}
    >
      {children ?? <ChevronUp aria-hidden size={14} />}
    </SelectScrollUpArrow>
  );
}

export type SelectScrollDownArrowProps = React.ComponentProps<
  typeof SelectScrollDownArrow
> &
  XstyleProp;

function ScrollDownArrow({
  children,
  className,
  xstyle,
  ...props
}: SelectScrollDownArrowProps) {
  return (
    <SelectScrollDownArrow
      {...props}
      {...themeSlotProps("select-popup", "scroll-down-arrow")}
      className={mergeClassName(
        () => sx(styles.scrollArrow, styles.scrollArrowDown, xstyle),
        className,
      )}
    >
      {children ?? <ChevronDown aria-hidden size={14} />}
    </SelectScrollDownArrow>
  );
}

export const selectCompoundParts = {
  Root,
  Label: CompoundLabel,
  Trigger,
  Value,
  Icon,
  Portal,
  Positioner,
  Popup,
  List,
  Item,
  ItemText,
  ItemIndicator,
  Group,
  GroupLabel,
  Separator,
  ScrollUpArrow,
  ScrollDownArrow,
} as const;
