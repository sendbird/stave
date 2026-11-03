import { i18n, useTranslation } from "@/i18n";
import { commandLayout, commandDialogMarker, commandItemMarker } from "./command-layout.stylex";
import { VisuallyHidden } from "../ads/components/VisuallyHidden";
import * as React from "react";
import { Command as AdsCommand } from "../ads/components/Command";
import { AutocompleteInput } from "../ads/headless/autocomplete";
import { Separator } from "./separator";
import { Kbd } from "./kbd";
import { CheckIcon, SearchIcon } from "lucide-react";

import { styles as commandStyles } from "../ads/components/Command.styles";
import { sx } from "../ads/utils/stylex";
import { cx } from "../ads/utils/stylex";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CommandContextValue = {
  query: string;
  setQuery: (query: string) => void;
  selected?: string;
  shouldFilter: boolean;
  /** Item values the children walk found this render. */
  walked: ReadonlySet<string>;
  /** An item the walk could not see (rendered inside a wrapper) adds itself. */
  register: (value: string) => () => void;
};
const CommandContext = React.createContext<CommandContextValue>({
  query: "",
  setQuery: () => {},
  shouldFilter: false,
  walked: new Set(),
  register: () => () => {},
});

/**
 * Whether a row matches the typed query: every word appears in its value or
 * one of its keywords, case-insensitively. The one rule both the children walk
 * and each `CommandItem` apply, so a row inside a wrapper filters the same way.
 */
export function commandItemMatches(query: string, value: string, keywords: readonly string[] = []) {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const searchable = [value, ...keywords].join(" ").toLocaleLowerCase();
  return words.every((word) => searchable.includes(word));
}

/** Adapter parts that never render an item; the walk can skip them. */
const NON_ITEM_PARTS = new Set<unknown>();

type CommandProps = React.ComponentProps<"div"> & {
  shouldFilter?: boolean;
  loop?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
};

/**
 * Adapt the host's compound children; ADS owns keyboard and option behavior.
 *
 * Prefer passing `CommandItem`s as direct (or group-nested) children: the walk
 * below reads them to keep empty groups out and to list the items for the
 * keyboard. An item rendered inside a wrapper component is invisible to that
 * walk, so it filters itself and registers its value through context instead,
 * and a group holding such a wrapper is never pruned as empty.
 */
function Command({
  className,
  children,
  shouldFilter = true,
  loop = true,
  value,
  onValueChange,
  ...props
}: CommandProps) {
  useTranslation();
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState<string>();
  const [registered, setRegistered] = React.useState<readonly string[]>([]);
  const register = React.useCallback((itemValue: string) => {
    setRegistered((current) => (current.includes(itemValue) ? current : [...current, itemValue]));
    return () => setRegistered((current) => current.filter((entry) => entry !== itemValue));
  }, []);
  const items: string[] = [];
  // Wrapper components the walk cannot look inside; each may render items.
  let opaque = 0;
  function filterChildren(nodes: React.ReactNode): React.ReactNode {
    return React.Children.map(nodes, (node): React.ReactNode => {
      if (
        !React.isValidElement<{
          children?: React.ReactNode;
          value?: string;
          keywords?: string[];
        }>(node)
      )
        return node;
      if (node.type === CommandItem) {
        const itemValue = node.props.value ?? "";
        if (shouldFilter && !commandItemMatches(query, itemValue, node.props.keywords))
          return null;
        items.push(itemValue);
        return node;
      }
      if (node.props.children === undefined) {
        if (typeof node.type !== "string" && !NON_ITEM_PARTS.has(node.type)) opaque += 1;
        return node;
      }
      const before = items.length;
      const opaqueBefore = opaque;
      const nested = filterChildren(node.props.children);
      if (node.type === CommandGroup && items.length === before && opaque === opaqueBefore) return null;
      return React.cloneElement(node, {}, nested);
    });
  }
  const content = filterChildren(children);
  const walked = new Set(items);
  const allItems = [...items, ...registered.filter((entry) => !walked.has(entry))];
  return (
    <CommandContext.Provider
      value={{ query, setQuery, selected: value ?? highlighted, shouldFilter, walked, register }}
    >
      <AdsCommand.Root
        items={allItems}
        mode="none"
        keepHighlight
        loopFocus={loop}
        value={query}
        onValueChange={setQuery}
        onItemHighlighted={(item, details) => {
          if (details.reason === "none" && value && allItems.includes(value))
            return;
          setHighlighted(item);
          onValueChange?.(item ?? "");
        }}
      >
        <AdsCommand.Frame
          bare
          data-slot="command"
          className={className}
          xstyle={commandLayout.frame}
          {...props}
        >
          {content}
        </AdsCommand.Frame>
      </AdsCommand.Root>
    </CommandContext.Provider>
  );
}

function CommandDialog({
  title = i18n.t("ui:command.commandPalette"),
  description = i18n.t("ui:command.searchForACommandToRun"),
  children,
  className,
  showCloseButton = false,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  useTranslation();
  return (
    <Dialog {...props}>
      <VisuallyHidden><DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader></VisuallyHidden>
      <DialogContent
        xstyle={commandLayout.palette}
        className={cx(
          sx(commandDialogMarker),
          className,
        )}
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "onChange"> & {
  onValueChange?: (value: string) => void;
}) {
  useTranslation();
  const context = React.useContext(CommandContext);
  const { onValueChange, value, ...inputProps } = props;
  return (
    <div
      data-slot="command-input-wrapper"
      className={cx(
        sx(commandStyles.inputGroup, commandLayout.inputRow),
      )}
    >
      <SearchIcon className={sx(commandLayout.searchIcon)} />
      <AutocompleteInput
        data-slot="command-input"
        className={cx(
          sx(commandStyles.input, commandLayout.input),
          className,
        )}
        {...inputProps}
        value={value ?? context.query}
        onChange={(event) => {
          context.setQuery(event.target.value);
          onValueChange?.(event.target.value);
        }}
      />
      <span aria-hidden="true" className={sx(commandLayout.escape)}>
        <Kbd>{/* i18n-ignore: keyboard key name */}ESC</Kbd>
      </span>
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof AdsCommand.List>) {
  useTranslation();
  return (
    <AdsCommand.List
      data-slot="command-list"
      className={className}
      xstyle={commandLayout.list}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof AdsCommand.Empty>) {
  useTranslation();
  return (
    <AdsCommand.Empty
      data-slot="command-empty"
      className={className}
      xstyle={commandStyles.empty}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  heading,
  children,
  ...props
}: React.ComponentProps<"div"> & { heading?: React.ReactNode }) {
  useTranslation();
  return (
    <AdsCommand.Group
      data-slot="command-group"
      className={className}
      xstyle={commandLayout.group}
      {...props}
    >
      {heading ? (
        <AdsCommand.GroupLabel>{heading}</AdsCommand.GroupLabel>
      ) : null}
      {children}
    </AdsCommand.Group>
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  useTranslation();
  return (
    <Separator
      data-slot="command-separator"
      className={cx(sx(commandLayout.separator), className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  value,
  onSelect,
  keywords,
  ...props
}: Omit<React.ComponentProps<"div">, "onSelect"> & {
  value?: string;
  disabled?: boolean;
  onSelect?: (value: string) => void;
  keywords?: string[];
}) {
  useTranslation();
  const context = React.useContext(CommandContext);
  const itemValue = value ?? "";
  const hidden = context.shouldFilter && !commandItemMatches(context.query, itemValue, keywords);
  const unseen = !context.walked.has(itemValue);
  const { register } = context;
  React.useLayoutEffect(
    () => (unseen && !hidden ? register(itemValue) : undefined),
    [hidden, itemValue, register, unseen],
  );
  if (hidden) return null;
  return (
    <AdsCommand.Item
      data-slot="command-item"
      value={value}
      data-selected={context.selected === value}
      onClick={() => onSelect?.(value ?? "")}
      className={className}
      xstyle={[commandStyles.item, commandLayout.item, commandItemMarker]}
      {...props}
    >
      {children}
      <CheckIcon className={sx(commandLayout.checkedIcon)} />
    </AdsCommand.Item>
  );
}

/**
 * Trailing accelerator hint on a palette row. The wrapper owns only the
 * trailing alignment; the visible keycap is the ADS `Kbd`, so the palette,
 * menus, and the dialog footer all render one keycap treatment.
 */
function CommandShortcut({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  useTranslation();
  return (
    <span
      data-slot="command-shortcut"
      className={cx(sx(commandLayout.shortcut), className)}
      {...props}
    >
      <Kbd>{children}</Kbd>
    </span>
  );
}

for (const part of [CommandInput, CommandEmpty, CommandSeparator, CommandShortcut]) NON_ITEM_PARTS.add(part);

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
