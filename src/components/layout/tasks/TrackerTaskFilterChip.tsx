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
import { cn } from "@/lib/utils";

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
        ? (props.options.find((option) => option.value === selected[0])?.label ??
          selected[0])
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
            className={cn(
              "h-6.5 gap-1 px-2 text-[11px]",
              selected.length > 0 && "border-border/55 bg-background/85",
            )}
          />
        }
      >
        {props.label}
        {summary ? (
          <span className="max-w-28 truncate text-foreground">{summary}</span>
        ) : null}
        <ChevronDown className="size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
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
                    className="text-[12px]"
                  >
                    <Check
                      className={cn(
                        "size-3.5",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    {option.count === undefined ? null : (
                      <span className="tabular-nums text-[10px] text-muted-foreground">
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
