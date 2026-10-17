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

type RetainedTextModel = Pick<
  MonacoEditorApi.ITextModel,
  | "isDisposed"
  | "getValue"
  | "setValue"
  | "getFullModelRange"
  | "pushEditOperations"
  | "pushStackElement"
>;

/**
 * `reconcileEditorModelContent` for a model with no editor attached: the same
 * rule (read-only reset, otherwise one undoable full-range edit), applied
 * through the model's own undo stack.
 */
export function reconcileTextModelContent(args: {
  model: RetainedTextModel;
  content: string;
  readOnly: boolean;
}) {
  const { model } = args;
  if (model.getValue() === args.content) {
    return false;
  }
  if (args.readOnly) {
    model.setValue(args.content);
    return true;
  }
  model.pushStackElement();
  model.pushEditOperations(
    [],
    [
      {
        range: model.getFullModelRange(),
        text: args.content,
        forceMoveMarkers: true,
      },
    ],
    () => null,
  );
  model.pushStackElement();
  return true;
}

/**
 * Keep the models retained for a hidden panel in line with the store, so the
 * language-intelligence layer (which follows model changes) analyzes the
 * current text, e.g. after a reload from disk, instead of waiting for the
 * panel to show again. Only runs while the editor is unmounted: then no
 * editor's change listener can echo the edit back into the store. A model a
 * live editor still shows (another tab of the same file) belongs to that
 * editor and is left alone. Returns whether any model changed.
 */
export function syncRetainedEditorModels(args: {
  editorMounted: boolean;
  codeModel: RetainedTextModel | null;
  diffModels: {
    original: RetainedTextModel;
    modified: RetainedTextModel;
  } | null;
  content: string;
  originalContent: string;
  readOnly: boolean;
  liveEditors: readonly ModelOwner[];
}) {
  if (args.editorMounted) {
    return false;
  }
  const isFree = (model: RetainedTextModel | null): model is RetainedTextModel =>
    Boolean(model) &&
    !model!.isDisposed() &&
    !args.liveEditors.some((editor) => editor.getModel() === model);
  let changed = false;
  if (isFree(args.codeModel)) {
    changed =
      reconcileTextModelContent({
        model: args.codeModel,
        content: args.content,
        readOnly: args.readOnly,
      }) || changed;
  }
  const diffModels = args.diffModels;
  if (diffModels && isFree(diffModels.original)) {
    // The original side is never edited: reset it, as a remount does.
    changed =
      reconcileTextModelContent({
        model: diffModels.original,
        content: args.originalContent,
        readOnly: true,
      }) || changed;
  }
  if (diffModels && isFree(diffModels.modified)) {
    changed =
      reconcileTextModelContent({
        model: diffModels.modified,
        content: args.content,
        readOnly: args.readOnly,
      }) || changed;
  }
  return changed;
}
