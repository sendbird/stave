import {
  SEARCH_TASK_CONTENT_IPC,
  SearchTaskContentArgsSchema,
  SearchTaskContentResponseSchema,
  type SearchTaskContentArgs,
} from "../../src/lib/task-search/content-search";

export function contentSearchPreload(invoke: (channel: string, args: unknown) => Promise<unknown>) {
  return {
    searchTaskContent: async (args: SearchTaskContentArgs) =>
      SearchTaskContentResponseSchema.parse(
        await invoke(SEARCH_TASK_CONTENT_IPC, SearchTaskContentArgsSchema.parse(args)),
      ),
  };
}
