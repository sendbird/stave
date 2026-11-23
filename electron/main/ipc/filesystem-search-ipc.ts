import type { IpcMain, WebContents } from "electron";
import {
  normalizeFilesystemSearchQuery,
  type FilesystemSearchScope,
} from "../../../src/lib/fs/content-search";
import { searchFilesystemContent } from "./filesystem-search";
import { FilesystemSearchArgsSchema, FilesystemSearchScopeSchema } from "./schemas";

function searchKey(scope: FilesystemSearchScope) {
  return JSON.stringify([scope.workspaceId, scope.surface]);
}

export function registerFilesystemSearchHandlers(
  ipc: Pick<IpcMain, "handle">,
  runSearch = searchFilesystemContent,
) {
  // The invoking window's WebContents owns its search slots.
  const searches = new WeakMap<WebContents, Map<string, AbortController>>();

  ipc.handle("fs:search-content", async ({ sender }, args: unknown) => {
    const parsed = FilesystemSearchArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid file search request." };
    }
    const query = normalizeFilesystemSearchQuery(parsed.data.query);
    if (!query) {
      return { ok: false, stderr: "Missing search query." };
    }

    let slots = searches.get(sender);
    if (!slots) {
      const windowSlots = new Map<string, AbortController>();
      sender.once("destroyed", () => {
        for (const search of windowSlots.values()) search.abort();
        windowSlots.clear();
      });
      searches.set(sender, windowSlots);
      slots = windowSlots;
    }

    const key = searchKey(parsed.data);
    slots.get(key)?.abort();
    const controller = new AbortController();
    slots.set(key, controller);
    try {
      return await runSearch({ ...parsed.data, query }, controller.signal);
    } finally {
      if (slots.get(key) === controller) slots.delete(key);
    }
  });

  ipc.handle("fs:cancel-content-search", ({ sender }, args: unknown) => {
    const parsed = FilesystemSearchScopeSchema.safeParse(args);
    if (parsed.success) searches.get(sender)?.get(searchKey(parsed.data))?.abort();
  });
}
