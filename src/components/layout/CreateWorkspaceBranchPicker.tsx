import {
  Check,
  ChevronDown,
  GitBranch,
  LoaderCircle,
  Search,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import {
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  buildCreateWorkspaceBranchPickerRows,
  type CreateWorkspaceBranchOption,
} from "@/components/layout/CreateWorkspaceBranchPicker.utils";

interface CreateWorkspaceBranchPickerProps {
  defaultBranch?: string;
  disabled?: boolean;
  localBranches: string[];
  loading?: boolean;
  onChangeOption?: (option: CreateWorkspaceBranchOption) => void;
  onChange: (value: string) => void;
  remoteBranches: string[];
  value: string;
  valueScope?: CreateWorkspaceBranchOption["scope"];
}

function getScopeLabel(scope: "local" | "remote") {
  return scope === "remote" ? "Remote" : "Local";
}

function getSearchPlaceholder(args: {
  hasLocalBranches: boolean;
  hasRemoteBranches: boolean;
}) {
  if (args.hasLocalBranches && args.hasRemoteBranches) {
    return "Search local and remote branches...";
  }
  if (args.hasRemoteBranches) {
    return "Search remote branches...";
  }
  if (args.hasLocalBranches) {
    return "Search local branches...";
  }
  return "Search branches...";
}

function getOptionId(option: CreateWorkspaceBranchOption) {
  return `${option.scope}:${option.value}`;
}

export function CreateWorkspaceBranchPicker({
  defaultBranch,
  disabled = false,
  localBranches,
  loading = false,
  onChangeOption,
  onChange,
  remoteBranches,
  value,
  valueScope,
}: CreateWorkspaceBranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedOptionId, setHighlightedOptionId] = useState<string | null>(
    null,
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<VirtuosoHandle | null>(null);
  const highlightSourceRef = useRef<"auto" | "keyboard" | "pointer">("auto");
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(
    () =>
      buildCreateWorkspaceBranchPickerRows({
        defaultBranch,
        localBranches,
        query: deferredQuery,
        remoteBranches,
      }),
    [defaultBranch, deferredQuery, localBranches, remoteBranches],
  );
  const hasLocalBranches = localBranches.length > 0;
  const hasRemoteBranches = remoteBranches.length > 0;
  const showScopeBadges = hasLocalBranches && hasRemoteBranches;
  const visibleOptionIds = useMemo(
    () =>
      rows.flatMap((row) =>
        row.type === "option" ? [getOptionId(row.option)] : [],
      ),
    [rows],
  );
  const selectedOptionId = valueScope
    ? getOptionId({ scope: valueScope, value })
    : null;
  const selectedScope =
    valueScope ?? (remoteBranches.includes(value) ? "remote" : "local");
  const highlightedRowIndex = rows.findIndex(
    (row) =>
      row.type === "option" && getOptionId(row.option) === highlightedOptionId,
  );
  const listHeight = Math.min(320, Math.max(120, rows.length * 38));

  useEffect(() => {
    if (!open) {
      setQuery("");
      highlightSourceRef.current = "auto";
      setHighlightedOptionId(null);
      return;
    }

    const focusSearch = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(focusSearch);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    highlightSourceRef.current = "auto";
    setHighlightedOptionId((current) => {
      if (current && visibleOptionIds.includes(current)) {
        return current;
      }
      if (selectedOptionId && visibleOptionIds.includes(selectedOptionId)) {
        return selectedOptionId;
      }
      const firstMatchingOption = rows.find(
        (row) => row.type === "option" && row.option.value === value,
      );
      if (firstMatchingOption?.type === "option") {
        return getOptionId(firstMatchingOption.option);
      }
      return visibleOptionIds[0] ?? null;
    });
  }, [open, rows, selectedOptionId, value, visibleOptionIds]);

  useEffect(() => {
    if (!open || highlightedRowIndex < 0) {
      return;
    }
    if (highlightSourceRef.current === "pointer") {
      return;
    }

    listRef.current?.scrollToIndex({
      align: "center",
      behavior: "auto",
      index: highlightedRowIndex,
    });
  }, [highlightedRowIndex, open]);

  function moveHighlight(direction: -1 | 1) {
    if (visibleOptionIds.length === 0) {
      return;
    }

    const currentIndex = highlightedOptionId
      ? visibleOptionIds.indexOf(highlightedOptionId)
      : -1;
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : visibleOptionIds.length - 1
        : (currentIndex + direction + visibleOptionIds.length) %
          visibleOptionIds.length;

    highlightSourceRef.current = "keyboard";
    setHighlightedOptionId(visibleOptionIds[nextIndex] ?? null);
  }

  function handleSelect(option: CreateWorkspaceBranchOption) {
    onChange(option.value);
    onChangeOption?.(option);
    setOpen(false);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        moveHighlight(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        moveHighlight(-1);
        break;
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        if (!highlightedOptionId) {
          return;
        }
        {
          const highlightedOption = rows.find(
            (row) =>
              row.type === "option" &&
              getOptionId(row.option) === highlightedOptionId,
          );
          if (highlightedOption?.type === "option") {
            handleSelect(highlightedOption.option);
          }
        }
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background/80 px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
            open && "border-primary/70 bg-secondary/50",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{value}</span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            {loading ? (
              <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : showScopeBadges ? (
              <span className="rounded border border-border/70 bg-background/80 px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {getScopeLabel(selectedScope)}
              </span>
            ) : null}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="max-w-[32rem] gap-0 overflow-hidden border border-border/80 bg-card/96 p-0 shadow-2xl supports-backdrop-filter:backdrop-blur-xl"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-border/70 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={query}
              placeholder={getSearchPlaceholder({
                hasLocalBranches,
                hasRemoteBranches,
              })}
              className="h-9 border-border/70 bg-background/80 pl-9"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
        </div>
        {loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading branches...
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            No matching branches.
          </div>
        ) : (
          <Virtuoso
            ref={listRef}
            style={{ height: listHeight }}
            totalCount={rows.length}
            overscan={160}
            itemContent={(index) => {
              const row = rows[index];
              if (!row) {
                return null;
              }

              if (row.type === "label") {
                return (
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {row.label}
                  </div>
                );
              }

              const optionId = getOptionId(row.option);
              const isSelected = selectedOptionId
                ? optionId === selectedOptionId
                : row.option.value === value;
              const isHighlighted = optionId === highlightedOptionId;

              return (
                <div className="px-1 pb-1">
                  <button
                    type="button"
                    aria-selected={isSelected}
                    className={cn(
                      "relative flex w-full cursor-default items-center gap-2 rounded-sm py-2 pr-2 pl-3 text-left text-sm outline-hidden transition-colors select-none",
                      isHighlighted && "bg-accent text-accent-foreground",
                      !isHighlighted && "hover:bg-accent/60",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => {
                      if (optionId === highlightedOptionId) {
                        return;
                      }
                      highlightSourceRef.current = "pointer";
                      setHighlightedOptionId(optionId);
                    }}
                    onClick={() => handleSelect(row.option)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {row.option.value}
                    </span>
                    {showScopeBadges ? (
                      <span className="rounded border border-border/70 bg-background/80 px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {getScopeLabel(row.option.scope)}
                      </span>
                    ) : null}
                    <span className="flex size-4 items-center justify-center text-foreground">
                      {isSelected ? <Check className="size-4" /> : null}
                    </span>
                  </button>
                </div>
              );
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
