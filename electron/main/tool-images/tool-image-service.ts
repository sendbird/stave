import path from "node:path";
import { app } from "electron";
import { createToolImageStore, type ToolImageStore } from "./tool-image-store";

let store: ToolImageStore | null = null;

export function getToolImageStore(): ToolImageStore {
  store ??= createToolImageStore({
    rootDir: () => path.join(app.getPath("userData"), "tool-images"),
  });
  return store;
}

/** Removes a workspace's tool images; called when the workspace is archived. */
export async function removeWorkspaceToolImages(workspaceId: string) {
  try {
    await getToolImageStore().removeWorkspace(workspaceId);
  } catch (error) {
    console.warn("[tool-images] could not remove a workspace's images", {
      error: String(error),
    });
  }
}
