import { storeClaudeToolResultImages } from "./claude-tool-result-images";

/**
 * Stores a Claude message's tool-result images under the workspace's key. The
 * store reads Electron's user-data path, so it loads only when a result
 * actually carries an image; the runtime module stays importable without
 * Electron (unit tests).
 */
export function storeWorkspaceToolResultImages<T>(message: T, workspaceId: string | null | undefined): Promise<T> {
  return storeClaudeToolResultImages(message, async (image) => {
    const { getToolImageStore } = await import("../main/tool-images/tool-image-service");
    return getToolImageStore().save({ workspaceId: workspaceId ?? null, ...image });
  });
}
