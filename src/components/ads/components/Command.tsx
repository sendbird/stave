import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type * as React from "react";

import {
  AutocompleteCollection,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteInputGroup,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteRoot,
  type AutocompleteRootProps,
} from "../headless/autocomplete";
import {
  DialogBackdrop,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "../headless/dialog";
import { controlChrome } from "../recipes/control-chrome";
import { focusRing } from "../recipes/focus-ring";
import { listbox } from "../recipes/listbox";
import { transition } from "../recipes/transition";
import { cx, sx } from "../utils/stylex";
import { mergeClassName } from "./merge-class-name";
import { CommandFooterHint } from "./Command.parts";
import { styles } from "./Command.styles";

// ---------------------------------------------------------------------------
// Compound parts (compositional Command API). Command is an always-open inline
// Base UI Autocomplete (the command-palette model); `Root` is the behavior
// wrapper with those defaults baked in, `Frame` is the visual chrome, and the
// remaining parts are styled wrappers over the headless autocomplete parts.
// ---------------------------------------------------------------------------

/**
 * Only `items` is narrowed here — every other `AutocompleteRootProps` field
 * (including `filter` and `filteredItems`) passes through untouched, so a
 * caller can hand `Command.Root` a custom `filter` (e.g. to also match a
 * pasted URL against an item's metadata) the same way they would
 * `Autocomplete.Root` or `Combobox.Root`.
 */
export type CommandRootProps<ItemValue> = Omit<
  AutocompleteRootProps<ItemValue>,
  "items"
> & {
  /**
   * The command items — either a flat list (the array API's `CommandItem`s, or
   * your own), or Base UI's grouped shape, one `{ items }` object per group.
   *
   * The grouped form is what `Command.Group` / `Command.GroupLabel` /
   * `Command.Collection` consume: `Command.List`'s function child then receives
   * a GROUP per iteration instead of an item, and each group renders its own
   * rows through `Collection`. Without the grouped form in this type those
   * three parts exist but cannot be fed, which is how the palette ends up
   * faking headings inside focusable options.
   */
  items?: readonly ItemValue[] | readonly { items: readonly ItemValue[] }[];
};

/**
 * Behavior wrapper (renders no DOM). Defaults to the command-palette mode:
 * `inline`, `open`, `autoHighlight="always"`. Generic over the item value so
 * callers keep full typing on `items`/`onValueChange`.
 */
function Root<ItemValue>(props: CommandRootProps<ItemValue>) {
  const { autoHighlight = "always", inline = true, open = true } = props;
  // `AutocompleteRoot` is two overloads — flat items and grouped items — and a
  // union that spans both matches neither from inside a generic wrapper. The
  // union is the accurate public type (Base UI accepts either at runtime), so
  // the assertion is confined to this one hand-off rather than pushed onto
  // every caller.
  const rootProps = props as React.ComponentProps<typeof AutocompleteRoot>;
  return (
    <AutocompleteRoot
      {...rootProps}
      autoHighlight={autoHighlight}
      inline={inline}
      open={open}
    />
  );
}

export type CommandFrameProps = React.ComponentProps<"div"> & {
  /** Drop the outer border/shadow/radius — for use inside a Dialog/Popover. */
  bare?: boolean;
};

/** The visual chrome around the input + list. */
function Frame({ bare = false, className, ...props }: CommandFrameProps) {
  return (
    <div
      {...props}
      className={cx(sx(styles.root, bare && styles.rootBare), className)}
    />
  );
}

export type CommandInputProps = React.ComponentProps<typeof AutocompleteInput>;

/** The search field: input group + leading search icon + text input. */
function Input({ className, ...props }: CommandInputProps) {
  return (
    <AutocompleteInputGroup className={sx(styles.inputGroup)}>
      <Search aria-hidden className={sx(styles.searchIcon)} size={16} />
      <AutocompleteInput
        {...props}
        className={mergeClassName(() => sx(styles.input), className)}
      />
    </AutocompleteInputGroup>
  );
}

export type CommandListProps = React.ComponentProps<typeof AutocompleteList>;

/** The scrollable results list. Accepts a function child for item mapping. */
function List({ className, ...props }: CommandListProps) {
  return (
    <AutocompleteList
      {...props}
      className={mergeClassName(() => sx(styles.list), className)}
    />
  );
}

export type CommandItemProps = React.ComponentProps<typeof AutocompleteItem>;

/** One command row. Compose icon/label/shortcut children freely. */
function ItemPart({ className, ...props }: CommandItemProps) {
  return (
    <AutocompleteItem
      {...props}
      className={mergeClassName(
        (state) =>
          sx(
            styles.item,
            transition.colors,
            state.highlighted && listbox.itemHighlighted,
            state.disabled && styles.itemDisabled,
          ),
        className,
      )}
    />
  );
}

export type CommandEmptyProps = React.ComponentProps<typeof AutocompleteEmpty>;

/** Shown when the query matches nothing. */
function Empty({ className, ...props }: CommandEmptyProps) {
  return (
    <AutocompleteEmpty
      {...props}
      className={mergeClassName(() => sx(styles.empty), className)}
    />
  );
}

export type CommandCollectionProps = React.ComponentProps<
  typeof AutocompleteCollection
>;

/**
 * Renders one group's items. Base UI's grouped `items` shape hands
 * `Command.List` a group per iteration rather than an item, so the group's own
 * rows come from this part — without it, `Command.Group` can only wrap a
 * heading and the grouping cannot actually be rendered.
 *
 * **Do not forward this callback's `index` to `Command.Item`.** It is the
 * index within THIS group, while `Item`'s `index` is a position in the whole
 * list: passing it through gives every group's first row index 0, so two rows
 * render highlighted at once and ArrowDown from the first row of group A lands
 * on the *second* row of group B. Omit `index` entirely and the item registers
 * itself with the composite list, which is the only place the flat order is
 * known once a filter has run.
 */
function Collection(props: CommandCollectionProps) {
  return <AutocompleteCollection {...props} />;
}

export type CommandGroupProps = React.ComponentProps<typeof AutocompleteGroup>;

/** Groups related items under one `Command.GroupLabel`. */
function Group({ className, ...props }: CommandGroupProps) {
  return (
    <AutocompleteGroup
      {...props}
      className={mergeClassName(() => sx(styles.group), className)}
    />
  );
}

export type CommandGroupLabelProps = React.ComponentProps<
  typeof AutocompleteGroupLabel
>;

/** Heading for a `Command.Group`. */
function GroupLabel({ className, ...props }: CommandGroupLabelProps) {
  return (
    <AutocompleteGroupLabel
      {...props}
      className={mergeClassName(() => sx(styles.groupLabel), className)}
    />
  );
}

const compoundParts = {
  Root,
  Frame,
  Input,
  List,
  Item: ItemPart,
  Empty,
  Collection,
  Group,
  GroupLabel,
} as const;

// ---------------------------------------------------------------------------
// Array (back-compat convenience) API — re-implemented on the compound parts
// ---------------------------------------------------------------------------

export type CommandItem = {
  disabled?: boolean;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  label: React.ReactNode;
  onSelect?: () => void;
  shortcut?: string;
  value: string;
};

export type CommandProps = {
  /** Drop the outer border/shadow/radius — for use inside a Dialog/Popover. */
  bare?: boolean;
  className?: string;
  defaultValue?: string;
  emptyText?: React.ReactNode;
  items: CommandItem[];
  label?: React.ReactNode;
  loading?: boolean;
  loadingText?: React.ReactNode;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /**
   * Rendered between the input and the list — for sort/filter controls (a
   * `Menu`, a `ToggleGroup`, ...) that must stay outside the list so they
   * never steal its arrow-key roving.
   */
  toolbar?: React.ReactNode;
  value?: string;
};

function CommandArray({
  bare = false,
  className,
  defaultValue,
  emptyText = "No matching commands.",
  items,
  label = "Command menu",
  loading = false,
  loadingText = "Loading commands...",
  onValueChange,
  placeholder = "Search commands",
  toolbar,
  value,
}: CommandProps) {
  return (
    <Root
      defaultValue={defaultValue}
      itemToStringValue={commandItemToString}
      items={loading ? [] : items}
      onValueChange={onValueChange}
      value={value}
    >
      <Frame bare={bare} className={className}>
        {bare ? null : <span className={sx(styles.label)}>{label}</span>}
        <Input placeholder={placeholder} />
        {toolbar ? <div className={sx(styles.toolbar)}>{toolbar}</div> : null}
        {loading ? (
          <div className={sx(styles.empty)} role="status">
            {loadingText}
          </div>
        ) : (
          <List>
            {(item: CommandItem, index: number) => (
              <ItemPart
                disabled={item.disabled}
                index={index}
                key={item.value}
                onClick={item.onSelect}
                value={item}
              >
                <span className={sx(styles.itemIcon)}>{item.icon}</span>
                <span className={sx(styles.itemCopy)}>
                  <span className={sx(styles.itemLabel)}>{item.label}</span>
                  {item.description ? (
                    <span className={sx(styles.itemDescription)}>
                      {item.description}
                    </span>
                  ) : null}
                </span>
                {item.shortcut ? (
                  <span className={sx(styles.shortcut)}>{item.shortcut}</span>
                ) : null}
              </ItemPart>
            )}
          </List>
        )}
        {loading ? null : <Empty>{emptyText}</Empty>}
      </Frame>
    </Root>
  );
}

/**
 * Command supports two coexisting APIs (non-breaking):
 *
 * - **Array (convenience):** `<Command items={[…]} />`
 * - **Compound (compositional):**
 *   `<Command.Root items={…}><Command.Frame><Command.Input/><Command.List>…</Command.List></Command.Frame></Command.Root>`
 *   `Command.Group` / `Command.GroupLabel` group related `Command.Item`s
 *   under a heading, inside `Command.List`.
 *
 * The compound namespace is attached via `Object.assign`, so both call styles
 * resolve through the same `Command` export.
 */
export const Command = Object.assign(CommandArray, compoundParts);

function commandItemToString(item: CommandItem) {
  return typeof item.label === "string" ? item.label : item.value;
}

export type CommandDialogSize = "md" | "lg";

export type CommandDialogProps = Omit<CommandProps, "bare" | "items"> & {
  /**
   * Compose the palette body yourself — `Command.Root` + `Command.Frame bare`
   * and whatever the list needs — instead of handing over a flat `items`
   * array. Reach for it when the palette needs grouping
   * (`Command.Group`/`GroupLabel`), a custom `filter`, or rows that are not
   * all the same shape; the array API cannot express any of those, and the
   * dialog's instantaneous popup/backdrop, focus trap, and footer are the
   * parts worth keeping either way.
   *
   * `items` and the other array-API props are ignored while this is set, and
   * closing on select becomes the caller's job — `onOpenChange(false)` — since
   * only the caller knows which of its rows are selections and which (a
   * "manage…" row, say) open something else.
   */
  children?: React.ReactNode;
  defaultOpen?: boolean;
  /** The array API's rows. Omit when composing via `children`. */
  items?: CommandItem[];
  /**
   * Replaces the default ⌘↑↓/⏎/esc hint footer rendered below the list. Omit
   * to keep that default; pass `null` to render no footer at all.
   */
  footer?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  /**
   * Enable the ⌘K / Ctrl+K toggle shortcut. @default true
   *
   * The Atelier shell already owns a global ⌘K command palette — a
   * `CommandDialog` rendered inside a shell-hosted sub-app must pass
   * `shortcut={false}` and open through its own trigger/shortcut instead, or
   * the two palettes will fight over the same key.
   */
  shortcut?: boolean;
  /**
   * Popup width. `"md"` (420px, unchanged default) fits a plain list;
   * `"lg"` (720px) gives a `toolbar` (sort/filter controls) and wider rows
   * room to breathe.
   * @default "md"
   */
  size?: CommandDialogSize;
  /** Accessible dialog name (visually hidden). @default "Command menu" */
  title?: React.ReactNode;
  /**
   * Trigger button contents, rendered inside the dialog's own trigger button.
   * Pass `null` when the palette is opened from a control you render yourself
   * (a sidebar button, a keyboard shortcut) — otherwise the dialog plants a
   * second, unwanted "Show command" button next to yours.
   * @default "Show command"
   */
  trigger?: React.ReactNode;
};

/**
 * Command palette modal (beUI command-palette block): a trigger button
 * (and ⌘K) opens a centered, chromeless overlay containing the command list.
 * Selecting an item runs it and closes the palette.
 */
export function CommandDialog({
  children,
  defaultOpen = false,
  footer,
  items,
  onOpenChange,
  open: openProp,
  shortcut = true,
  size = "md",
  title = "Command menu",
  trigger = "Show command",
  ...commandProps
}: CommandDialogProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  useEffect(() => {
    if (!shortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen, shortcut]);

  const closingItems = (items ?? []).map((item) => ({
    ...item,
    onSelect: () => {
      item.onSelect?.();
      setOpen(false);
    },
  }));

  // `footer` distinguishes "omitted" (show the default hint row) from an
  // explicit value (including `null`, to render no footer at all) — a `??`
  // fallback could not tell those apart.
  const footerContent = footer === undefined ? <CommandFooterHint /> : footer;

  return (
    <DialogRoot onOpenChange={setOpen} open={open}>
      {trigger === null ? null : (
        <DialogTrigger
          className={sx(
            styles.trigger,
            controlChrome.trigger,
            transition.colors,
            focusRing.ring,
          )}
        >
          <Search aria-hidden size={16} />
          {trigger}
          {/* The hint has to follow the binding: with `shortcut={false}` the
            palette does not answer ⌘K, and printing it anyway teaches a key
            that does nothing (or, inside the Atelier shell, one that opens a
            different palette). */}
          {shortcut ? <kbd className={sx(styles.kbd)}>⌘K</kbd> : null}
        </DialogTrigger>
      )}
      <DialogPortal>
        <DialogBackdrop className={sx(styles.backdrop)} />
        <DialogPopup
          className={sx(styles.popup, size === "lg" && styles.popupLg)}
        >
          <DialogTitle className={sx(styles.srOnly)}>{title}</DialogTitle>
          {children ?? <Command {...commandProps} bare items={closingItems} />}
          {footerContent}
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
