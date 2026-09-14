import { ChevronLeft, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
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
import { listbox } from "../recipes/listbox";
import { transition } from "../recipes/transition";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { mergeClassName } from "./merge-class-name";
import { Button } from "./Button";
import { styles } from "./Command.styles";
import type { CommandItem, CommandProps } from "./Command.types";
import { Kbd } from "./Kbd";

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
} & XstyleProp;

/** The visual chrome around the input + list. */
function Frame({
  bare = false,
  className,
  xstyle,
  ...props
}: CommandFrameProps) {
  const theme = themeProps("command");
  return (
    <div
      {...props}
      {...theme}
      className={cx(
        sx(styles.root, bare && styles.rootBare, xstyle),
        theme.className,
        className,
      )}
    />
  );
}

export type CommandInputProps = React.ComponentProps<typeof AutocompleteInput> &
  XstyleProp;

/** The search field: input group + leading search icon + text input. */
function Input({ className, xstyle, ...props }: CommandInputProps) {
  return (
    <AutocompleteInputGroup
      {...themeSlotProps("command", "input-group")}
      className={sx(styles.inputGroup)}
    >
      <Search
        aria-hidden
        {...themeSlotProps("command", "icon")}
        className={sx(styles.searchIcon)}
        size={16}
      />
      <AutocompleteInput
        {...props}
        {...themeSlotProps("command", "input")}
        className={mergeClassName(() => sx(styles.input, xstyle), className)}
      />
    </AutocompleteInputGroup>
  );
}

export type CommandListProps = React.ComponentProps<typeof AutocompleteList> &
  XstyleProp;

/** The scrollable results list. Accepts a function child for item mapping. */
function List({ className, xstyle, ...props }: CommandListProps) {
  return (
    <AutocompleteList
      {...props}
      {...themeSlotProps("command", "list")}
      className={mergeClassName(() => sx(styles.list, xstyle), className)}
    />
  );
}

export type CommandItemProps = React.ComponentProps<typeof AutocompleteItem> &
  XstyleProp;

/** One command row. Compose icon/label/shortcut children freely. */
function ItemPart({ className, xstyle, ...props }: CommandItemProps) {
  const theme = themeProps("command-item");
  return (
    <AutocompleteItem
      {...props}
      className={(state) =>
        cx(
          sx(
            styles.item,
            transition.colors,
            state.highlighted && listbox.itemHighlighted,
            state.disabled && styles.itemDisabled,
            xstyle,
          ),
          theme.className,
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}

export type CommandEmptyProps = React.ComponentProps<typeof AutocompleteEmpty> &
  XstyleProp;

/** Shown when the query matches nothing. */
function Empty({ className, xstyle, ...props }: CommandEmptyProps) {
  return (
    <AutocompleteEmpty
      {...props}
      {...themeSlotProps("command", "empty")}
      className={mergeClassName(() => sx(styles.empty, xstyle), className)}
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

export type CommandGroupProps = React.ComponentProps<typeof AutocompleteGroup> &
  XstyleProp;

/** Groups related items under one `Command.GroupLabel`. */
function Group({ className, xstyle, ...props }: CommandGroupProps) {
  return (
    <AutocompleteGroup
      {...props}
      {...themeSlotProps("command", "group")}
      className={mergeClassName(() => sx(styles.group, xstyle), className)}
    />
  );
}

export type CommandGroupLabelProps = React.ComponentProps<
  typeof AutocompleteGroupLabel
> &
  XstyleProp;

/** Heading for a `Command.Group`. */
function GroupLabel({ className, xstyle, ...props }: CommandGroupLabelProps) {
  return (
    <AutocompleteGroupLabel
      {...props}
      {...themeSlotProps("command", "group-label")}
      className={mergeClassName(() => sx(styles.groupLabel, xstyle), className)}
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

function CommandArray({
  bare = false,
  className,
  defaultPageId,
  defaultRecentValues = [],
  defaultValue,
  emptyText = "No matching commands.",
  items,
  label = "Command menu",
  loading = false,
  loadingText = "Loading commands...",
  maxRecents = 5,
  onItemSelect,
  onPageChange,
  onRecentValuesChange,
  onValueChange,
  pages = [],
  placeholder = "Search commands",
  recentValues,
  toolbar,
  value,
  xstyle,
}: CommandProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const [pageStack, setPageStack] = useState<string[]>(() =>
    defaultPageId ? [defaultPageId] : [],
  );
  const [internalRecents, setInternalRecents] = useState(defaultRecentValues);
  const query = value === undefined ? internalValue : value;
  const resolvedRecents = recentValues ?? internalRecents;
  const pagesById = useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  );
  const currentPageId = pageStack.at(-1) ?? null;
  const currentPage = currentPageId ? pagesById.get(currentPageId) : undefined;
  const currentItems = currentPage?.items ?? items;
  const allItems = useMemo(
    () => [...items, ...pages.flatMap((page) => page.items)],
    [items, pages],
  );
  const displayItems = useMemo(() => {
    if (loading) return [];
    if (currentPage || query.trim()) return currentItems;

    const recentItems = resolvedRecents
      .map((recentValue) =>
        allItems.find(
          (item) => item.value === recentValue && item.pageId === undefined,
        ),
      )
      .filter((item): item is CommandItem => item !== undefined);
    if (recentItems.length === 0) return currentItems;

    const recentSet = new Set(recentItems.map((item) => item.value));
    const remaining = currentItems.filter((item) => !recentSet.has(item.value));
    return [
      ...recentItems.map((item, index) => ({
        ...item,
        sectionLabel: index === 0 ? "Recent" : undefined,
      })),
      ...remaining.map((item, index) => ({
        ...item,
        sectionLabel: index === 0 ? "Commands" : undefined,
      })),
    ];
  }, [allItems, currentItems, currentPage, loading, query, resolvedRecents]);

  const setQuery = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  const openPage = (pageId: string) => {
    if (!pagesById.has(pageId)) return;
    setPageStack((current) => [...current, pageId]);
    setQuery("");
    onPageChange?.(pageId);
  };

  const goBack = () => {
    setPageStack((current) => {
      const next = current.slice(0, -1);
      onPageChange?.(next.at(-1) ?? null);
      return next;
    });
    setQuery("");
  };

  const remember = (item: CommandItem) => {
    const next = [
      item.value,
      ...resolvedRecents.filter((value) => value !== item.value),
    ].slice(0, Math.max(0, maxRecents));
    if (recentValues === undefined) setInternalRecents(next);
    onRecentValuesChange?.(next);
  };

  const activate = (item: CommandItem) => {
    if (item.pageId) {
      openPage(item.pageId);
      return;
    }
    item.onSelect?.();
    remember(item);
    onItemSelect?.(item);
  };

  return (
    <Root
      itemToStringValue={commandItemToString}
      items={displayItems}
      onValueChange={(nextValue, details) => {
        if (details.reason === "item-press") {
          details.cancel();
          return;
        }
        setQuery(nextValue);
      }}
      value={query}
    >
      <Frame
        bare={bare}
        className={className}
        xstyle={xstyle}
        onKeyDownCapture={(event) => {
          if (event.key !== "Escape" || pageStack.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          goBack();
        }}
      >
        {bare ? null : <span className={sx(styles.label)}>{label}</span>}
        <Input placeholder={currentPage?.placeholder ?? placeholder} />
        {currentPage ? (
          <div className={sx(styles.pageHeader)}>
            <Button
              aria-label="Back one command page"
              onClick={goBack}
              size="iconSm"
              variant="quiet"
            >
              <ChevronLeft aria-hidden size={16} />
            </Button>
            <span className={sx(styles.pageTitle)}>{currentPage.label}</span>
          </div>
        ) : null}
        {toolbar ? <div className={sx(styles.toolbar)}>{toolbar}</div> : null}
        {loading ? (
          <div className={sx(styles.empty)} role="status">
            {loadingText}
          </div>
        ) : (
          <List>
            {(item: CommandItem & { sectionLabel?: string }, index: number) => (
              <Fragment key={item.value}>
                {item.sectionLabel ? (
                  <span className={sx(styles.sectionLabel)}>
                    {item.sectionLabel}
                  </span>
                ) : null}
                <ItemPart
                  disabled={item.disabled}
                  index={index}
                  onClick={() => activate(item)}
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
                    <span className={sx(styles.shortcut)}>
                      {typeof item.shortcut === "string" ||
                      typeof item.shortcut === "number" ? (
                        <Kbd size="sm">{item.shortcut}</Kbd>
                      ) : (
                        item.shortcut
                      )}
                    </span>
                  ) : null}
                </ItemPart>
              </Fragment>
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

export type { CommandItem, CommandPage, CommandProps } from "./Command.types";
