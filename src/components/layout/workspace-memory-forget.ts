import type { ReactNode } from "react";
import { i18n } from "@/i18n";
import type { RepositoryMemory } from "@/lib/repository-memory";
import { offerUndoToast } from "@/lib/notifications/pending-undo";
import { toast } from "@/lib/notifications/toast";
import { failureMessage } from "./workspace-information/failure-message";

type RepositoryMemoryBridge = NonNullable<NonNullable<Window["api"]>["repositoryMemory"]>;

export interface ForgetMemoryDeps {
  api: Pick<RepositoryMemoryBridge, "delete" | "restore"> | undefined;
  /** The list changed (a row went or came back): reload what shows it. */
  onChanged: () => void;
  offerUndo?: (
    title: ReactNode,
    options: { undoLabel: ReactNode; onUndo: () => void; description?: ReactNode },
  ) => unknown;
  showError?: (message: string) => void;
}

/** Enough of the memory to recognise it in the toast; the toast does not clamp. */
const TOAST_EXCERPT_MAX_CHARS = 90;

export function memoryToastExcerpt(content: string) {
  if (content.length <= TOAST_EXCERPT_MAX_CHARS) return content;
  const cut = content.slice(0, TOAST_EXCERPT_MAX_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${(space > TOAST_EXCERPT_MAX_CHARS * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Forget a memory at once and offer its Undo, instead of asking first.
 *
 * The store soft-deletes the row, so it leaves recall and the list straight
 * away, and the Undo toast (or Cmd/Ctrl+Z while it shows) restores it through
 * `repository-memory:restore` exactly as it was. A desktop build without the
 * restore bridge still forgets, without offering an Undo it cannot keep.
 * Returns whether the memory was forgotten; a failure is reported and thrown
 * nowhere, so the row stays.
 */
export async function forgetMemoryWithUndo(
  memory: Pick<RepositoryMemory, "id" | "repositoryPath" | "content">,
  deps: ForgetMemoryDeps,
): Promise<boolean> {
  const showError = deps.showError ?? ((message: string) => void toast.error(message));
  try {
    const result = await deps.api?.delete?.({ id: memory.id });
    if (!result?.ok) throw new Error(result?.message ?? "");
  } catch (error) {
    showError(failureMessage(i18n.t("workspace:memory.section.forgetFailed"), error));
    return false;
  }
  deps.onChanged();
  const restore = deps.api?.restore;
  if (!restore) return true;
  (deps.offerUndo ?? offerUndoToast)(i18n.t("workspace:memory.forgotten.title"), {
    description: memoryToastExcerpt(memory.content),
    undoLabel: i18n.t("common:actions.undo"),
    onUndo: () => {
      void (async () => {
        try {
          const result = await restore({ id: memory.id, repositoryPath: memory.repositoryPath });
          if (!result?.ok || !result.memory) throw new Error(result?.message ?? "");
          deps.onChanged();
        } catch (error) {
          showError(failureMessage(i18n.t("workspace:memory.forgotten.restoreFailed"), error));
        }
      })();
    },
  });
  return true;
}
