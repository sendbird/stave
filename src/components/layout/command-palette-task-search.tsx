import { i18n } from "@/i18n";
import { formatTimeAgo } from "@/i18n/format";
import { useEffect, useRef, useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { Badge, CommandGroup, CommandItem } from "@/components/ui";
import { searchTasks } from "@/lib/db/task-search.db";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { TaskSearchResult, TaskSearchState } from "@/lib/task-search/task-search-ipc";
import { useAppStore } from "@/store/app.store";
import { commandPaletteStyles } from "./global-command-palette.styles";

/** Where the palette looks for tasks: the open workspace, or every registered repository. */
export type PaletteTaskScope = "workspace" | "all";

/**
 * The palette's sections for a task scope. Under All repositories the open
 * workspace's own task rows give way to the search across repositories;
 * every other command, Fleet's row included, stays as it is.
 */
export function filterSectionsForTaskScope<T extends { items: ReadonlyArray<{ id: string }> }>(
  sections: readonly T[],
  scope: PaletteTaskScope,
): T[] {
  if (scope === "workspace") return [...sections];
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.id.startsWith("task.select.")) }))
    .filter((section) => section.items.length > 0);
}

const SEARCH_DELAY_MS = 120;
const SEARCH_LIMIT = 20;

export type PaletteTaskSearch =
  | { status: "idle" }
  | { status: "searching"; results: TaskSearchResult[] }
  | { status: "ready"; results: TaskSearchResult[] }
  | { status: "error"; results: TaskSearchResult[] };

/** The tasks of every registered repository matching the query, while `enabled`. */
export function usePaletteTaskSearch(args: { query: string; enabled: boolean }): PaletteTaskSearch {
  const [search, setSearch] = useState<PaletteTaskSearch>({ status: "idle" });
  const requestRef = useRef(0);
  useEffect(() => {
    if (!args.enabled) {
      requestRef.current += 1;
      setSearch({ status: "idle" });
      return;
    }
    const request = ++requestRef.current;
    setSearch((current) => ({ status: "searching", results: current.status === "idle" ? [] : current.results }));
    const timer = window.setTimeout(() => {
      void searchTasks({ query: args.query.trim(), limit: SEARCH_LIMIT })
        .then((response) => {
          if (requestRef.current !== request) return;
          setSearch(response.ok ? { status: "ready", results: response.results } : { status: "error", results: [] });
        })
        .catch(() => {
          if (requestRef.current === request) setSearch({ status: "error", results: [] });
        });
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [args.enabled, args.query]);
  return search;
}

export function taskSearchItemValue(result: Pick<TaskSearchResult, "workspaceId" | "taskId">) {
  return `task-search:${result.workspaceId}:${result.taskId}`;
}

const STATE_KEYS: Record<TaskSearchState, string> = {
  running: "shell:taskSearch.state.running",
  completed: "shell:taskSearch.state.completed",
  failed: "shell:taskSearch.state.failed",
  cancelled: "shell:taskSearch.state.cancelled",
  new: "shell:taskSearch.state.new",
  archived: "shell:taskSearch.state.archived",
};

/** Where a result lives: repository, then workspace and its branch, then its folder. */
export function describeTaskSearchPlace(result: TaskSearchResult) {
  const workspace = result.isDefaultWorkspace
    ? i18n.t("shell:taskSearch.defaultWorkspace")
    : result.workspaceName;
  const branch = result.workspaceBranch ? ` (${result.workspaceBranch})` : "";
  return `${result.repositoryName} › ${workspace}${branch} · ${result.workspacePath}`;
}

export function describeTaskSearchState(result: TaskSearchResult) {
  return i18n.t(STATE_KEYS[result.state] as "shell:taskSearch.state.running");
}

/** Open a result: its repository, then its workspace, then the task. */
export function openTaskSearchResult(result: TaskSearchResult) {
  void useAppStore.getState().focusTaskAttention({
    taskId: result.taskId,
    workspaceId: result.workspaceId,
    repositoryPath: result.repositoryPath,
  });
}

/**
 * The All repositories results as palette elements. A function, not a
 * component: the palette's `Command` finds its items by walking its children,
 * so the group and its items must be elements it can see. Without results it
 * is a plain status line (a group without items is dropped).
 */
export function renderTaskSearchGroup(props: {
  search: PaletteTaskSearch;
  query: string;
  onOpen: (result: TaskSearchResult) => void;
}) {
  const { search } = props;
  if (search.status === "idle") return null;
  const results = search.results;
  const heading = i18n.t("shell:taskSearch.heading");
  if (results.length === 0) {
    return (
      <div className={sx(commandPaletteStyles.group)} data-task-search-status="">
        <p className={sx(commandPaletteStyles.searchHeading)}>{heading}</p>
        <p className={sx(commandPaletteStyles.searchNotice)} role="status">
          {search.status === "searching"
            ? i18n.t("shell:taskSearch.searching")
            : search.status === "error"
              ? i18n.t("shell:taskSearch.failed")
              : props.query.trim()
                ? i18n.t("shell:taskSearch.noMatch", { query: props.query.trim() })
                : i18n.t("shell:taskSearch.noTasks")}
        </p>
      </div>
    );
  }
  return (
    <CommandGroup heading={heading} className={sx(commandPaletteStyles.group)}>
      {results.map((result) => (
        <CommandItem
          key={taskSearchItemValue(result)}
          value={taskSearchItemValue(result)}
          onSelect={() => props.onOpen(result)}
          className={sx(commandPaletteStyles.item)}
          data-task-search-result=""
        >
          <div className={sx(commandPaletteStyles.itemIconBox)}>
            <ModelIcon providerId={result.provider as ProviderId} className={sx(commandPaletteStyles.itemIcon)} />
          </div>
          <div className={sx(commandPaletteStyles.itemBody)}>
            <div className={sx(commandPaletteStyles.itemTitleRow)}>
              <span className={sx(commandPaletteStyles.itemTitle)}>
                {result.title.trim() || i18n.t("shell:taskSearch.untitled")}
              </span>
              <Badge variant="secondary" className={sx(commandPaletteStyles.contextBadge)}>
                {describeTaskSearchState(result)}
              </Badge>
            </div>
            <p className={sx(commandPaletteStyles.itemSubtitle)} title={describeTaskSearchPlace(result)}>
              {describeTaskSearchPlace(result)}
            </p>
          </div>
          <span className={sx(commandPaletteStyles.searchTime)} title={result.updatedAt}>
            {formatTimeAgo(result.updatedAt)}
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
