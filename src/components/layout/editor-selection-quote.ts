import { i18n } from "@/i18n";
import type { editor as MonacoEditorApi } from "monaco-editor";
import { toast } from "@/components/ui";
import {
  appendSelectionQuoteToDraft,
  formatSelectionQuote,
} from "@/lib/editor/selection-quote";
import { useAppStore } from "@/store/app.store";

/** Draft key the composer uses before a task exists. */
const DRAFT_SESSION_TASK_ID = "draft:session";

/**
 * Adds "Quote Selection in Chat" to the editor's context menu. It appends the
 * selected lines as a Markdown quote, with the file path and line numbers, to
 * the active task's composer draft, where the user writes their comment.
 */
export function registerQuoteSelectionInChatAction(args: {
  editor: MonacoEditorApi.IStandaloneCodeEditor;
  getFilePath: () => string | null;
}) {
  return args.editor.addAction({
    id: "stave.editor.quoteSelectionInChat",
    label: i18n.t("editor:editorSelectionQuote.quoteInChat"),
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.6,
    precondition: "editorHasSelection",
    run: (editor) => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      const filePath = args.getFilePath();
      if (!selection || !model || !filePath || selection.isEmpty()) {
        return;
      }
      // A selection ending at column 1 does not include that line.
      const endLine =
        selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber
          ? selection.endLineNumber - 1
          : selection.endLineNumber;
      const quote = formatSelectionQuote({
        filePath,
        startLine: selection.startLineNumber,
        endLine,
        text: model.getValueInRange(selection),
      });
      if (!quote) {
        return;
      }
      const state = useAppStore.getState();
      const taskId = state.activeTaskId || DRAFT_SESSION_TASK_ID;
      state.updatePromptDraft({
        taskId,
        patch: {
          text: appendSelectionQuoteToDraft(
            state.promptDraftByTask[taskId]?.text ?? "",
            quote,
          ),
        },
      });
      toast.success(i18n.t("editor:editorSelectionQuote.quoted"));
    },
  });
}
