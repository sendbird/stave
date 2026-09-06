import { commandLayout, commandDialogMarker, commandItemMarker } from "./command-layout.stylex";
import { VisuallyHidden } from "../ads/components/VisuallyHidden";
import * as React from "react";
import { Command as AdsCommand } from "../ads/components/Command";
import { AutocompleteInput } from "../ads/headless/autocomplete";
import { Separator } from "./separator";
import { CheckIcon, SearchIcon } from "lucide-react";

import { styles as commandStyles } from "../ads/components/Command.styles";
import { sx } from "../ads/utils/stylex";
import { cx } from "../ads/utils/stylex";
import { mergeClassName } from "../ads/components/merge-class-name";
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
};
const CommandContext = React.createContext<CommandContextValue>({
  query: "",
  setQuery: () => {},
});

type CommandProps = React.ComponentProps<"div"> & {
  shouldFilter?: boolean;
  loop?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
};

/** Adapt the host's compound children; ADS owns keyboard and option behavior. */
function Command({
  className,
  children,
  shouldFilter = true,
  loop = true,
  value,
  onValueChange,
  ...props
}: CommandProps) {
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState<string>();
  const items: string[] = [];
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
        const searchable = [itemValue, ...(node.props.keywords ?? [])]
          .join(" ")
          .toLocaleLowerCase();
        if (
          shouldFilter &&
          !query
            .toLocaleLowerCase()
            .split(/\s+/)
            .every((word) => searchable.includes(word))
        )
          return null;
        items.push(itemValue);
        return node;
      }
      if (node.props.children === undefined) return node;
      const before = items.length;
      const nested = filterChildren(node.props.children);
      if (node.type === CommandGroup && items.length === before) return null;
      return React.cloneElement(node, {}, nested);
    });
  }
  const content = filterChildren(children);
  return (
    <CommandContext.Provider
      value={{ query, setQuery, selected: value ?? highlighted }}
    >
      <AdsCommand.Root
        items={items}
        mode="none"
        keepHighlight
        loopFocus={loop}
        value={query}
        onValueChange={setQuery}
        onItemHighlighted={(item, details) => {
          if (details.reason === "none" && value && items.includes(value))
            return;
          setHighlighted(item);
          onValueChange?.(item ?? "");
        }}
      >
        <AdsCommand.Frame
          bare
          data-slot="command"
          className={cx(sx(commandLayout.frame), className)}
          {...props}
        >
          {content}
        </AdsCommand.Frame>
      </AdsCommand.Root>
    </CommandContext.Provider>
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
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
      <kbd
        aria-hidden="true"
        className={sx(commandLayout.escape)}
      >
        ESC
      </kbd>
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof AdsCommand.List>) {
  return (
    <AdsCommand.List
      data-slot="command-list"
      className={mergeClassName(
        () => sx(commandLayout.list),
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof AdsCommand.Empty>) {
  return (
    <AdsCommand.Empty
      data-slot="command-empty"
      className={mergeClassName(() => sx(commandStyles.empty), className)}
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
  return (
    <AdsCommand.Group
      data-slot="command-group"
      className={cx(sx(commandLayout.group), className)}
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
  keywords: _keywords,
  ...props
}: Omit<React.ComponentProps<"div">, "onSelect"> & {
  value?: string;
  disabled?: boolean;
  onSelect?: (value: string) => void;
  keywords?: string[];
}) {
  const context = React.useContext(CommandContext);
  return (
    <AdsCommand.Item
      data-slot="command-item"
      value={value}
      data-selected={context.selected === value}
      onClick={() => onSelect?.(value ?? "")}
      className={cx(
        sx(commandStyles.item, commandLayout.item, commandItemMarker),
        className,
      )}
      {...props}
    >
      {children}
      <CheckIcon className={sx(commandLayout.checkedIcon)} />
    </AdsCommand.Item>
  );
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cx(sx(commandStyles.shortcut, commandLayout.shortcut), className)}
      {...props}
    />
  );
}

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
