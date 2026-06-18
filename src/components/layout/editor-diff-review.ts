import type { editor as MonacoEditorApi } from "monaco-editor";

export interface DiffReviewCommentTarget {
  line?: number;
}

interface Disposable {
  dispose(): void;
}

export function getModifiedDiffEditorLine(
  diffEditor: MonacoEditorApi.IStandaloneDiffEditor | null,
): number | undefined {
  const lineNumber = diffEditor
    ?.getModifiedEditor()
    .getPosition()
    ?.lineNumber;
  if (
    typeof lineNumber !== "number" ||
    !Number.isInteger(lineNumber) ||
    lineNumber < 1
  ) {
    return undefined;
  }
  return lineNumber;
}

export function registerDiffReviewCommentAction(args: {
  editor: MonacoEditorApi.IStandaloneCodeEditor;
  onAddComment: (target: DiffReviewCommentTarget) => void;
}): Disposable {
  return args.editor.addAction({
    id: "stave.diffReview.addComment",
    label: "Add Review Comment",
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.5,
    run: (editor) => {
      const lineNumber = editor.getPosition()?.lineNumber;
      args.onAddComment({
        line:
          typeof lineNumber === "number" &&
          Number.isInteger(lineNumber) &&
          lineNumber >= 1
            ? lineNumber
            : undefined,
      });
    },
  });
}
