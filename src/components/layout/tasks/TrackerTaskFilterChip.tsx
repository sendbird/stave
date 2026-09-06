import { Check, ChevronDown } from "lucide-react";

import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import * as stylex from "@stylexjs/stylex";
import { taskRowStyles as styles } from "./tasks-row.styles";

export interface TrackerTaskFilterOption {
  value: string;
  label: string;
  /** Rows currently matching this option, shown so a dead chip is visible. */
  count?: number;
}

export interface TrackerTaskFilterChipProps {
  label: string;
  options: readonly TrackerTaskFilterOption[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
  /** Shown above the option list when the source list is empty. */
  emptyMessage?: string;
  /** Skips the search box for short, fixed option sets. */
  searchable?: boolean;
}

/**
 * One filter dimension.
 *
 * Multi-select with an explicit summary in the trigger: a chip that only shows
 * a count forces the user to open it to remember what they filtered by, which
 * is the state people get stuck in when a list looks empty for no reason.
 */
export function TrackerTaskFilterChip(props: TrackerTaskFilterChipProps) {
  const selected = props.selected;
  const summary =
    selected.length === 0
      ? null
      : selected.length === 1
        ? (props.options.find((option) => option.value === selected[0])
            ?.label ?? selected[0])
        : `${selected.length} selected`;

  const toggle = (value: string) => {
    props.onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value],
    );
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={selected.length > 0 ? "secondary" : "ghost"}
            xstyle={[
              styles.filterTrigger,
              selected.length > 0 && styles.filterActive,
            ]}
          />
        }
      >
        {props.label}
        {summary ? (
          <span {...stylex.props(styles.filterSummary)}>{summary}</span>
        ) : null}
        <ChevronDown {...stylex.props(styles.filterChevron)} />
      </PopoverTrigger>
      <PopoverContent xstyle={styles.filterPopup} align="start">
        <Command>
          {props.searchable === false ? null : (
            <CommandInput placeholder={`Filter ${props.label.toLowerCase()}`} />
          )}
          <CommandList>
            <CommandEmpty>
              {props.emptyMessage ?? "Nothing to filter by yet."}
            </CommandEmpty>
            <CommandGroup>
              {props.options.map((option) => {
                const active = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                    className={stylex.props(styles.commandItem).className}
                  >
                    <Check
                      className={
                        stylex.props(
                          styles.commandCheck,
                          active ? styles.visible : styles.hidden,
                        ).className
                      }
                    />
                    <span {...stylex.props(styles.commandOption)}>
                      {option.label}
                    </span>
                    {option.count === undefined ? null : (
                      <span {...stylex.props(styles.optionCount)}>
                        {option.count}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
