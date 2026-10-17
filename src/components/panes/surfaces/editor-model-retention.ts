import type { editor as MonacoEditorApi } from "monaco-editor";

/**
 * Model bookkeeping for editors that unmount while their panel is hidden.
 *
 * The Monaco widget is released while the panel is hidden, but its text
 * models are kept: they hold the undo history, and the language-intelligence
 * layer opens an LSP document per model, so disposing them on every tab
 * switch would drop undo and churn LSP open/close. Models are disposed when
 * the surface unmounts or stops showing that editor, as before.
 */

type ModelOwner = Pick<MonacoEditorApi.ICodeEditor, "getModel">;

/**
 * Dispose a model unless another live editor still shows it (two tabs can
 * share a file model) or it is already gone.
 */
export function disposeTextModelIfUnused(args: {
  model: MonacoEditorApi.ITextModel | null | undefined;
  liveEditors: readonly ModelOwner[];
  exceptEditor?: ModelOwner | null;
}) {
  const { model } = args;
  if (!model || model.isDisposed()) {
    return false;
  }
  const inUse = args.liveEditors.some(
    (editor) => editor !== args.exceptEditor && editor.getModel() === model,
  );
  if (inUse) {
    return false;
  }
  model.dispose();
  return true;
}

/**
 * Bring a reused model in line with the store's content when an editor
 * remounts over it. The store is the source of truth (every edit is mirrored
 * into it), and it can change while the editor is unmounted, e.g. a reload
 * from disk. Mirrors `@monaco-editor/react`'s own value sync: read-only
 * editors are reset, editable ones get one undoable full-range edit.
 */
export function reconcileEditorModelContent(args: {
  editor: Pick<
    MonacoEditorApi.ICodeEditor,
    "getModel" | "setValue" | "executeEdits" | "pushUndoStop"
  >;
  content: string;
  readOnly: boolean;
}) {
  const model = args.editor.getModel();
  if (!model || model.getValue() === args.content) {
    return false;
  }
  if (args.readOnly) {
    args.editor.setValue(args.content);
    return true;
  }
  args.editor.executeEdits("", [
    {
      range: model.getFullModelRange(),
      text: args.content,
      forceMoveMarkers: true,
    },
  ]);
  args.editor.pushUndoStop();
  return true;
}
