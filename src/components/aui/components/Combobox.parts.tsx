import { i18n } from "@/i18n";
import { Check, ChevronDown, X } from "lucide-react";
import type * as React from "react";

import {
  ComboboxClear,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxPopup,
  ComboboxPositioner,
  ComboboxRoot,
  ComboboxTrigger,
  type ComboboxRootProps,
} from "../headless/combobox";
import { controlIconSizes } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { listbox } from "../recipes/listbox";
import { surfaceChrome } from "../recipes/surface-chrome";
import { transition } from "../recipes/transition";
import { usePortalProductThemeProps } from "../theming/ProductThemeProvider";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import {
  POPUP_SIDE_OFFSET,
  type PopupPlacement,
  resolvePlacement,
} from "../utils/placement";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { type ComboboxScaleProps, type ComboboxSize } from "./Combobox.scale";
import {
  iconButtonStylesBySize,
  itemStylesBySize,
  styles,
} from "./Combobox.styles";
import {
  Group,
  GroupLabel,
  Portal,
  Separator,
  Value,
} from "./Combobox.passthrough";
// The prop types moved with them; re-exported by name so `Combobox`'s
// `export type * from "./Combobox.parts"` still carries the full public API.
export type {
  ComboboxChipProps,
  ComboboxChipRemoveProps,
  ComboboxChipsProps,
} from "./Combobox.chips";
export type {
  ComboboxGroupLabelProps,
  ComboboxGroupProps,
  ComboboxPortalProps,
  ComboboxSeparatorProps,
  ComboboxValueProps,
} from "./Combobox.passthrough";
import { Chip, ChipRemove, Chips } from "./Combobox.chips";
import { FieldTrigger } from "./Combobox.fieldTrigger";
import { Loader } from "./Loader";
import { ComboboxInPopupContext, Input, InputGroup } from "./Combobox.input";
import { mergeClassName } from "./merge-class-name";

/**
 * The compound (compositional) half of `Combobox` — `Root`, `InputGroup`,
 * `Input`, `Popup`, `List`, `Item`, and the rest of the anatomy. The array
 * convenience API is built on these in `Combobox.array`, and the root that
 * joins the two into one export is `Combobox`. None of these are exported
 * from the package barrel individually: `Combobox.<Part>` stays the only way
 * to reach them.
 */

// ---------------------------------------------------------------------------
// Compound parts (primary, compositional API)
// ---------------------------------------------------------------------------

type ComboboxInputChangeDetails = {
  cancel: () => void;
  event?: Event;
  isItemPress?: boolean;
  reason: string;
};

/**
 * Whether a clear came from choosing a row. Newer Base UI releases flag it as
 * `isItemPress`; the installed one re-uses the press event, so the target is
 * checked as the fallback.
 */
const isItemPress = (details: ComboboxInputChangeDetails) =>
  details.isItemPress === true ||
  (details.event?.target instanceof Element &&
    details.event.target.closest('[role="option"]') !== null);

/**
 * Base UI's multiple-mode Combobox clears the input whenever the popup closes
 * without a pick — including Enter with no highlighted row. Keep the typed
 * query so a search field does not vanish. Clear (`clear-press`) and a real
 * selection (an item press) still go through.
 */
const isClearedWithoutSelection = (
  nextQuery: string,
  details: ComboboxInputChangeDetails,
) =>
  nextQuery === "" && details.reason === "input-clear" && !isItemPress(details);

/**
 * `Combobox.Root` wraps the Base UI root, preserving its generic
 * `Value`/`Multiple` inference so callers keep full typing on `items`,
 * `value`, and `onValueChange`.
 */
function Root<Value, Multiple extends boolean | undefined = false>({
  onInputValueChange,
  ...props
}: ComboboxRootProps<Value, Multiple>) {
  return (
    <ComboboxRoot
      {...props}
      onInputValueChange={(nextQuery, details) => {
        if (isClearedWithoutSelection(nextQuery, details)) {
          details.cancel();
          return;
        }
        onInputValueChange?.(nextQuery, details);
      }}
    />
  );
}

export type ComboboxActionsProps = React.ComponentProps<"div"> & XstyleProp;

function Actions({ className, xstyle, ...props }: ComboboxActionsProps) {
  return (
    <div
      {...props}
      {...themeSlotProps("combobox-field", "actions")}
      className={cx(sx(styles.actions, xstyle), className)}
    />
  );
}

export type ComboboxClearProps = React.ComponentProps<typeof ComboboxClear> &
  ComboboxScaleProps &
  XstyleProp;

function Clear({
  children,
  className,
  size = "md",
  xstyle,
  ...props
}: ComboboxClearProps) {
  return (
    <ComboboxClear
      {...props}
      {...themeSlotProps("combobox-field", "clear")}
      className={mergeClassName(
        () =>
          sx(
            surfaceChrome.quietIconButton,
            styles.iconButton,
            iconButtonStylesBySize[size],
            focusRing.ring,
            xstyle,
          ),
        className,
      )}
    >
      {children ?? <X aria-hidden size={controlIconSizes.sm} />}
    </ComboboxClear>
  );
}

export type ComboboxLoadingProps = Omit<
  React.ComponentProps<typeof Loader>,
  "size"
> &
  ComboboxScaleProps &
  XstyleProp;

/**
 * In-flight mark for the `Actions` slot while options are still coming. It
 * takes the `Clear` button's exact box at every size, so a request settling
 * swaps a glyph rather than reflowing the group and nudging the caret — the
 * rule `SearchField` already follows. Pair it with `aria-busy` on the
 * `InputGroup`; the popup's own status row covers the open state.
 */
function Loading({
  className,
  label = i18n.t("ui:combobox.loadingOptions"),
  size = "md",
  xstyle,
  ...props
}: ComboboxLoadingProps) {
  return (
    <Loader
      {...props}
      {...themeSlotProps("combobox-field", "loading")}
      className={cx(
        sx(
          styles.iconButton,
          iconButtonStylesBySize[size],
          styles.loading,
          xstyle,
        ),
        className,
      )}
      label={label}
      size="xs"
      tone="neutral"
    />
  );
}

export type ComboboxTriggerProps = React.ComponentProps<
  typeof ComboboxTrigger
> &
  ComboboxScaleProps & {
    /** Stretch the trigger to its container (table cells, property rows). */
    fullWidth?: boolean;
    /** Hand all visual chrome to the rendered element. */
    variant?: ComboboxTriggerVariant;
    /**
     * `"icon"` (default) is the square in-field affordance: quiet icon-button
     * chrome, a `controlHeight`-sized box, and a `ChevronDown` when no
     * children are given.
     *
     * `"content"` drops that chrome so the trigger is sized and painted purely
     * by the caller's `className` — required when the trigger IS the value (a
     * table cell showing an avatar and name) or a labelled toolbar button.
     * Without it the square `inlineSize`/`minBlockSize` wins the StyleX
     * cascade against a caller stylesheet and clips the content to 32×32.
     * @default "icon"
     */
    shape?: "content" | "icon";
  } & XstyleProp;

export type ComboboxTriggerVariant = "default" | "unstyled";

/**
 * Renders the open/close affordance. Passes Base UI's `render` prop straight
 * through so callers can render the trigger *as* their own element.
 */
function Trigger({
  children,
  className,
  fullWidth = false,
  shape = "icon",
  size = "md",
  variant = "default",
  xstyle,
  ...props
}: ComboboxTriggerProps) {
  const icon = shape === "icon";
  const styled = variant !== "unstyled";
  return (
    <ComboboxTrigger
      {...props}
      {...themeSlotProps("combobox-field", "trigger")}
      className={mergeClassName(
        () =>
          sx(
            styled && icon && surfaceChrome.quietIconButton,
            styled && icon && styles.iconButton,
            styled && icon && iconButtonStylesBySize[size],
            styled && fullWidth && styles.triggerFullWidth,
            styled && focusRing.ring,
            xstyle,
          ),
        className,
      )}
    >
      {icon
        ? (children ?? <ChevronDown aria-hidden size={controlIconSizes.md} />)
        : children}
    </ComboboxTrigger>
  );
}

export type ComboboxPositionerProps = React.ComponentProps<
  typeof ComboboxPositioner
> & {
  /** Where the list opens against its anchor. @default "bottom-start" */
  placement?: PopupPlacement;
} & XstyleProp;

function Positioner({
  align,
  className,
  placement,
  side,
  sideOffset = POPUP_SIDE_OFFSET,
  xstyle,
  ...props
}: ComboboxPositionerProps) {
  const resolved = resolvePlacement(placement);
  return (
    <ComboboxPositioner
      {...props}
      align={align ?? resolved.align}
      className={mergeClassName(
        () => sx(listbox.positioner, xstyle),
        className,
      )}
      side={side ?? resolved.side}
      sideOffset={sideOffset}
    />
  );
}

export type ComboboxPopupProps = React.ComponentProps<typeof ComboboxPopup> &
  XstyleProp;

const popupClassName = (theme: string, xstyle?: XstyleProp["xstyle"]) =>
  cx(
    sx(styles.popup, listbox.popupWidth, xstyle),
    theme,
    "atelier-motion-dropdown",
  ) ?? "";

function Popup({ className, xstyle, ...props }: ComboboxPopupProps) {
  const theme = themeProps("combobox-popup");
  // The list leaves its provider's DOM subtree through the portal, so it has to
  // carry the brand with it: `@scope` is a fact about the DOM tree, and a
  // portal is exactly where the DOM tree and the React tree disagree.
  const portalTheme = usePortalProductThemeProps();
  return (
    <ComboboxInPopupContext.Provider value>
      <ComboboxPopup
        {...props}
        {...portalTheme}
        {...theme}
        className={mergeClassName(
          () => popupClassName(theme.className, xstyle),
          className,
        )}
      />
    </ComboboxInPopupContext.Provider>
  );
}

export type ComboboxListProps = React.ComponentProps<typeof ComboboxList> &
  XstyleProp;

function List({ className, xstyle, ...props }: ComboboxListProps) {
  return (
    <ComboboxList
      {...props}
      {...themeSlotProps("combobox-popup", "list")}
      className={mergeClassName(() => sx(listbox.list, xstyle), className)}
    />
  );
}

export type ComboboxItemProps = React.ComponentProps<typeof ComboboxItem> &
  ComboboxScaleProps &
  XstyleProp;

function Item({ className, size = "md", xstyle, ...props }: ComboboxItemProps) {
  const theme = themeProps("combobox-item", { size });
  return (
    <ComboboxItem
      {...props}
      {...theme}
      className={mergeClassName(
        (state) =>
          cx(
            sx(
              styles.item,
              transition.colors,
              itemStylesBySize[size],
              // Not on the chosen row. Base UI parks `data-highlighted` there when
              // the popup opens and — measured on this component — never moves it
              // again, arrow keys included, so the flag was a fill that appeared
              // on the chosen row once and stayed. `styles.item`'s own `:hover`
              // is what actually follows the pointer here, and it still lights
              // this row like any other.
              state.highlighted && !state.selected && listbox.itemHighlighted,
              state.selected && styles.itemSelected,
              state.disabled && listbox.itemDisabled,
              xstyle,
            ),
            theme.className,
          ) ?? "",
        className,
      )}
    />
  );
}

export type ComboboxItemIndicatorProps = React.ComponentProps<
  typeof ComboboxItemIndicator
> &
  XstyleProp;

function ItemIndicator({
  children,
  className,
  keepMounted = true,
  xstyle,
  ...props
}: ComboboxItemIndicatorProps) {
  return (
    <ComboboxItemIndicator
      {...props}
      {...themeSlotProps("combobox-item", "indicator")}
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
    </ComboboxItemIndicator>
  );
}

export type ComboboxEmptyProps = React.ComponentProps<typeof ComboboxEmpty> &
  XstyleProp;

function Empty({ className, xstyle, ...props }: ComboboxEmptyProps) {
  return (
    <ComboboxEmpty
      {...props}
      {...themeSlotProps("combobox-popup", "empty")}
      className={mergeClassName(() => sx(listbox.empty, xstyle), className)}
    />
  );
}

export const compoundParts = {
  Root,
  InputGroup,
  Input,
  Actions,
  Clear,
  Loading,
  Trigger,
  /** A Combobox opened from a closed field — see `Combobox.fieldTrigger`. */
  FieldTrigger,
  Chips,
  Chip,
  ChipRemove,
  Value,
  Portal,
  Positioner,
  Popup,
  List,
  Item,
  ItemIndicator,
  Empty,
  Group,
  GroupLabel,
  Separator,
} as const;

export type { ComboboxSize };

export type {
  ComboboxInputGroupProps,
  ComboboxInputProps,
} from "./Combobox.input";
export type { ComboboxFieldTriggerProps } from "./Combobox.fieldTrigger";
