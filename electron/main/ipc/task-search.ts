import { ipcMain } from "electron";
import { ensurePersistenceReady } from "../state";
import { searchTasks } from "../../persistence/task-search";
import {
  SearchTasksArgsSchema,
  TASK_SEARCH_IPC,
  type SearchTasksResponse,
} from "../../../src/lib/task-search/task-search-ipc";

/** The palette's search over every registered repository's tasks. Messages are diagnostics. */
export function registerTaskSearchHandlers() {
  ipcMain.handle(
    TASK_SEARCH_IPC,
    async (_event, input: unknown): Promise<SearchTasksResponse> => {
      const parsed = SearchTasksArgsSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "Invalid task search." };
      try {
        const store = await ensurePersistenceReady();
        return { ok: true, results: searchTasks(store, parsed.data) };
      } catch (error) {
        return { ok: false, message: `Tasks could not be searched: ${String(error)}` };
      }
    },
  );
}
