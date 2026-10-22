import type { SearchTasksArgs, SearchTasksResponse } from "@/lib/task-search/task-search-ipc";

/** Every registered repository's tasks matching the query; an empty list without the desktop bridge. */
export async function searchTasks(args: SearchTasksArgs): Promise<SearchTasksResponse> {
  const search = window.api?.persistence?.searchTasks;
  if (!search) {
    return { ok: true, results: [] };
  }
  return search(args);
}
