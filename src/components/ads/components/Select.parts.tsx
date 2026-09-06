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
  POPUP_SIDE_OFFSET,
  type PopupPlacement,
  resolvePlacement,
} from "../utils/placement";
import { cx, sx } from "../utils/stylex";
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

export type SelectLabelProps = React.ComponentProps<typeof SelectLabel>;

function CompoundLabel({ className, ...props }: SelectLabelProps) {
  return (
    <SelectLabel
      {...props}
      className={mergeClassName(() => sx(styles.label), className)}
    />
  );
}

export type SelectTriggerProps = React.ComponentProps<typeof SelectTrigger> & {
  /** Tints the border with the invalid tone. Composed here, not by a caller's
   * `className`: the package's own classes win on CSS source order. */
  invalid?: boolean;
  size?: SelectSize;
};

function Trigger({
  className,
  invalid = false,
  size: resolvedSize = "md",
  ...props
}: SelectTriggerProps) {
  return (
    <SelectTrigger
      {...props}
      className={mergeClassName(
        (state) =>
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
          ),
        className,
      )}
    />
  );
}

export type SelectValueProps = React.ComponentProps<typeof SelectValue>;

function Value({ className, ...props }: SelectValueProps) {
  return (
    <SelectValue
      {...props}
      className={mergeClassName(() => sx(styles.value), className)}
    />
  );
}

export type SelectIconProps = React.ComponentProps<typeof SelectIcon>;

function Icon({ children, className, ...props }: SelectIconProps) {
  return (
    <SelectIcon
      {...props}
      className={mergeClassName(() => sx(styles.icon), className)}
    >
      {children ?? <ChevronDown aria-hidden size={16} />}
    </SelectIcon>
  );
}

export type SelectPortalProps = React.ComponentProps<typeof SelectPortal>;

function Portal(props: SelectPortalProps) {
  return <SelectPortal {...props} />;
}

export type SelectPositionerProps = React.ComponentProps<
  typeof SelectPositioner
> & {
  /** Where the list opens against its trigger. @default "bottom-start" */
  placement?: PopupPlacement;
};

function Positioner({
  align,
  alignItemWithTrigger = false,
  className,
  placement,
  side,
  sideOffset = POPUP_SIDE_OFFSET,
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
      className={mergeClassName(() => sx(styles.positioner), className)}
      side={side ?? resolved.side}
      sideOffset={sideOffset}
    />
  );
}

export type SelectPopupProps = React.ComponentProps<typeof SelectPopup>;

function Popup({ className, ...props }: SelectPopupProps) {
  return (
    <SelectPopup
      {...props}
      className={mergeClassName(
        () =>
          cx(sx(styles.popup, listbox.popupWidth), "atelier-motion-dropdown") ??
          "",
        className,
      )}
    />
  );
}

export type SelectListProps = React.ComponentProps<typeof SelectList>;

function List({ className, ...props }: SelectListProps) {
  return (
    <SelectList
      {...props}
      className={mergeClassName(() => sx(listbox.list), className)}
    />
  );
}

export type SelectItemProps = React.ComponentProps<typeof SelectItem> & {
  size?: SelectSize;
};

function Item({
  className,
  size: resolvedSize = "md",
  ...props
}: SelectItemProps) {
  return (
    <SelectItem
      {...props}
      className={mergeClassName(
        (state) =>
          sx(
            styles.item,
            transition.colors,
            itemStylesBySize[resolvedSize],
            state.highlighted && styles.itemHighlighted,
            state.selected && styles.itemSelected,
            state.disabled && styles.itemDisabled,
          ),
        className,
      )}
    />
  );
}

export type SelectItemTextProps = React.ComponentProps<typeof SelectItemText>;

function ItemText({ className, ...props }: SelectItemTextProps) {
  return (
    <SelectItemText
      {...props}
      className={mergeClassName(() => sx(styles.itemText), className)}
    />
  );
}

export type SelectItemIndicatorProps = React.ComponentProps<
  typeof SelectItemIndicator
>;

function ItemIndicator({
  children,
  className,
  keepMounted = true,
  ...props
}: SelectItemIndicatorProps) {
  return (
    <SelectItemIndicator
      {...props}
      className={mergeClassName(
        (state) =>
          sx(
            styles.itemIndicator,
            !state.selected && styles.itemIndicatorHidden,
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
>;

function GroupLabel({ className, ...props }: SelectGroupLabelProps) {
  return (
    <SelectGroupLabelPart
      {...props}
      className={mergeClassName(() => sx(styles.groupLabel), className)}
    />
  );
}

export type SelectSeparatorProps = React.ComponentProps<
  typeof SelectSeparatorPart
>;

function Separator({ className, ...props }: SelectSeparatorProps) {
  return (
    <SelectSeparatorPart
      {...props}
      className={mergeClassName(() => sx(styles.separator), className)}
    />
  );
}

export type SelectScrollUpArrowProps = React.ComponentProps<
  typeof SelectScrollUpArrow
>;

function ScrollUpArrow({
  children,
  className,
  ...props
}: SelectScrollUpArrowProps) {
  return (
    <SelectScrollUpArrow
      {...props}
      className={mergeClassName(
        () => sx(styles.scrollArrow, styles.scrollArrowUp),
        className,
      )}
    >
      {children ?? <ChevronUp aria-hidden size={14} />}
    </SelectScrollUpArrow>
  );
}

export type SelectScrollDownArrowProps = React.ComponentProps<
  typeof SelectScrollDownArrow
>;

function ScrollDownArrow({
  children,
  className,
  ...props
}: SelectScrollDownArrowProps) {
  return (
    <SelectScrollDownArrow
      {...props}
      className={mergeClassName(
        () => sx(styles.scrollArrow, styles.scrollArrowDown),
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
