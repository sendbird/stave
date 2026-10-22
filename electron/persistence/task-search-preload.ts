import {
  TASK_SEARCH_IPC,
  type SearchTasksArgs,
  type SearchTasksResponse,
} from "../../src/lib/task-search/task-search-ipc";

export function taskSearchPreload(invoke: (channel: string, args: unknown) => Promise<unknown>) {
  return {
    searchTasks: (args: SearchTasksArgs) =>
      invoke(TASK_SEARCH_IPC, args) as Promise<SearchTasksResponse>,
  };
}
