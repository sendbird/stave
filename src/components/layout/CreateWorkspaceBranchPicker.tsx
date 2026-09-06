import { Button as AdsButton } from "@/components/ads/components/Button";
import { Check, ChevronDown, GitBranch, Search } from "lucide-react";
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
  Loader,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import {
  buildCreateWorkspaceBranchPickerRows,
  type CreateWorkspaceBranchOption,
} from "@/components/layout/CreateWorkspaceBranchPicker.utils";
import { branchPickerStyles } from "./create-workspace-branch-picker.styles";

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
      <PopoverTrigger
        render={
          <AdsButton layout="host"
            type="button"
            disabled={disabled}
            xstyle={[
              branchPickerStyles.trigger,
              open && branchPickerStyles.triggerOpen,
            ]}
          />
        }
      >
        <span className={sx(branchPickerStyles.triggerValue)}>
          <GitBranch className={sx(branchPickerStyles.branchIcon)} />
          <span className={sx(branchPickerStyles.truncated)}>{value}</span>
        </span>
        <span className={sx(branchPickerStyles.triggerMeta)}>
          {loading ? (
            <Loader
              aria-hidden
              className={sx(branchPickerStyles.loaderInline)}
              size="xs"
              tone="neutral"
              variant="sync"
            />
          ) : showScopeBadges ? (
            <span className={sx(branchPickerStyles.scopeBadge)}>
              {getScopeLabel(selectedScope)}
            </span>
          ) : null}
          <ChevronDown className={sx(branchPickerStyles.chevronIcon)} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        xstyle={branchPickerStyles.popover}
        style={{ width: "var(--anchor-width)" }}
        initialFocus={false}
      >
        <div className={sx(branchPickerStyles.searchBar)}>
          <div className={sx(branchPickerStyles.searchField)}>
            <Search className={sx(branchPickerStyles.searchIcon)} />
            <Input
              ref={searchInputRef}
              value={query}
              placeholder={getSearchPlaceholder({
                hasLocalBranches,
                hasRemoteBranches,
              })}
              xstyle={branchPickerStyles.searchInput}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
        </div>
        {loading && rows.length === 0 ? (
          <div className={sx(branchPickerStyles.loadingRow)}>
            <Loader aria-hidden size="xs" variant="sync" />
            Loading branches...
          </div>
        ) : rows.length === 0 ? (
          <div className={sx(branchPickerStyles.emptyRow)}>
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
                  <div className={sx(branchPickerStyles.groupLabel)}>
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
                <div className={sx(branchPickerStyles.optionRow)}>
                  <AdsButton layout="host"
                    type="button"
                    aria-selected={isSelected}
                    xstyle={[
                      branchPickerStyles.option,
                      isHighlighted
                        ? branchPickerStyles.optionHighlighted
                        : branchPickerStyles.optionIdle,
                    ]}
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
                    <span className={sx(branchPickerStyles.optionLabel)}>
                      {row.option.value}
                    </span>
                    {showScopeBadges ? (
                      <span className={sx(branchPickerStyles.scopeBadge)}>
                        {getScopeLabel(row.option.scope)}
                      </span>
                    ) : null}
                    <span className={sx(branchPickerStyles.optionCheck)}>
                      {isSelected ? (
                        <Check className={sx(branchPickerStyles.checkIcon)} />
                      ) : null}
                    </span>
                  </AdsButton>
                </div>
              );
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
