import { i18n } from "@/i18n";
import { toast } from "@/components/ui";
import { mergeAttachedFilePaths } from "@/components/session/chat-input.attachments";
import { useAppStore } from "@/store/app.store";

/** Draft key the composer uses before a task exists. */
const DRAFT_SESSION_TASK_ID = "draft:session";

/** `<root>/<workspace-relative path>`, keeping the root's own separator style. */
function absoluteScratchPath(rootPath: string, filePath: string) {
  const separator = rootPath.includes("\\") && !rootPath.includes("/") ? "\\" : "/";
  return `${rootPath.replace(/[\\/]+$/, "")}${separator}${filePath.split("/").join(separator)}`;
}

/**
 * Adds a scratch file to the active task's composer through the same import
 * path pasted and dropped files take (`fs:import-attachments`): a file inside
 * the workspace keeps its workspace path, so the message cites
 * `.stave/scratch/...`. Then focuses the composer.
 */
export async function attachScratchFileToComposer(args: { rootPath: string; filePath: string }): Promise<boolean> {
  const importAttachments = window.api?.fs?.importAttachments;
  const name = args.filePath.slice(args.filePath.lastIndexOf("/") + 1);
  if (!importAttachments) {
    toast.error(i18n.t("workspace:workspaceScratchPanel.attachFailed", { name }));
    return false;
  }
  try {
    const result = await importAttachments({
      rootPath: args.rootPath,
      entries: [{ absolutePath: absoluteScratchPath(args.rootPath, args.filePath) }],
    });
    if (!result.ok || result.filePaths.length === 0) {
      toast.error(i18n.t("workspace:workspaceScratchPanel.attachFailed", { name }));
      return false;
    }
    const state = useAppStore.getState();
    const taskId = state.activeTaskId || DRAFT_SESSION_TASK_ID;
    const current = state.promptDraftByTask[taskId]?.attachedFilePaths ?? [];
    const next = mergeAttachedFilePaths(current, result.filePaths);
    if (next.length !== current.length) {
      state.updatePromptDraft({ taskId, patch: { attachedFilePaths: next } });
    }
    useAppStore.setState((current) => ({ promptFocusNonce: current.promptFocusNonce + 1 }));
    toast.success(i18n.t("workspace:workspaceScratchPanel.attached", { name }));
    return true;
  } catch {
    toast.error(i18n.t("workspace:workspaceScratchPanel.attachFailed", { name }));
    return false;
  }
}
