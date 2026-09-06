import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { diffReviewHoverMenuStyles as styles } from "@/components/layout/editor-diff-review-hover-menu.styles";
import type { editor as MonacoEditorApi } from "monaco-editor";
import { Plus } from "lucide-react";
import type { MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  collectModifiedDiffCommentableLines,
  resolveDiffReviewHoverLine,
} from "@/components/layout/editor-diff-review";

type MonacoNamespace = typeof import("monaco-editor");

export interface DiffReviewLineHoverController {
  updateThreadLines: (lines: Iterable<number>) => void;
  dispose: () => void;
}

export function DiffReviewHoverMenu(args: {
  line: number;
  hasThread: boolean;
  onAddComment: () => void;
}) {
  const ariaLabel = args.hasThread
    ? `Add another review comment on modified line ${args.line}`
    : `Add review comment on modified line ${args.line}`;
  const stopEditorMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <AdsButton layout="host"
      type="button"
      data-testid="diff-review-hover-menu"
      data-review-line={args.line}
      data-review-side="modified"
      aria-label={ariaLabel}
      title={ariaLabel}
      xstyle={styles.trigger}
      onMouseDown={stopEditorMouseDown}
      onClick={args.onAddComment}
    >
      <Plus className={sx(styles.glyph)} />
    </AdsButton>
  );
}

export function createDiffReviewLineHoverController(args: {
  diffEditor: MonacoEditorApi.IStandaloneDiffEditor;
  editor: MonacoEditorApi.IStandaloneCodeEditor;
  monaco: MonacoNamespace;
  onAddComment: (line: number) => void;
}): DiffReviewLineHoverController {
  const decorations = args.editor.createDecorationsCollection();
  const domNode = document.createElement("div");
  domNode.className = "stave-diff-comment-hover-menu-host";
  const root = createRoot(domNode);
  let threadLines = new Set<number>();
  let commentableLines = new Set<number>();
  let hoveredLine: number | undefined;
  let hoveredLineHasThread = false;
  let disposed = false;

  const contentWidget: MonacoEditorApi.IContentWidget = {
    suppressMouseDown: true,
    getId: () => "stave.diffReview.hoverMenu",
    getDomNode: () => domNode,
    getPosition: () =>
      hoveredLine
        ? {
            position: { lineNumber: hoveredLine, column: 1 },
            preference: [
              args.monaco.editor.ContentWidgetPositionPreference.EXACT,
            ],
          }
        : null,
    beforeRender: () => ({ width: 28, height: 28 }),
  };

  const setHoveredLine = (line: number | undefined) => {
    const hasThread = line ? threadLines.has(line) : false;
    if (hoveredLine === line && hoveredLineHasThread === hasThread) {
      return;
    }
    hoveredLine = line;
    hoveredLineHasThread = hasThread;
    if (line) {
      root.render(
        <DiffReviewHoverMenu
          line={line}
          hasThread={hasThread}
          onAddComment={() => {
            const targetLine = hoveredLine;
            if (!targetLine) {
              return;
            }
            setHoveredLine(undefined);
            args.onAddComment(targetLine);
          }}
        />,
      );
    } else {
      root.render(null);
    }
    args.editor.layoutContentWidget(contentWidget);
  };

  const refresh = () => {
    commentableLines = new Set(
      collectModifiedDiffCommentableLines(args.diffEditor.getLineChanges()),
    );
    const lineCount = args.editor.getModel()?.getLineCount() ?? 0;
    const visibleThreadLines = [...threadLines]
      .filter((line) => line >= 1 && line <= lineCount)
      .sort((left, right) => left - right);
    decorations.set(
      visibleThreadLines.map((line) => ({
        range: new args.monaco.Range(line, 1, line, 1),
        options: {
          glyphMarginClassName:
            "stave-diff-comment-glyph stave-diff-comment-glyph-has-thread",
        },
      })),
    );
    if (
      hoveredLine &&
      !commentableLines.has(hoveredLine) &&
      !threadLines.has(hoveredLine)
    ) {
      setHoveredLine(undefined);
    }
  };

  const lineTargetTypes = new Set([
    args.monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN,
    args.monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS,
    args.monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS,
    args.monaco.editor.MouseTargetType.CONTENT_TEXT,
    args.monaco.editor.MouseTargetType.CONTENT_EMPTY,
  ]);

  args.editor.addContentWidget(contentWidget);
  const diffDisposable = args.diffEditor.onDidUpdateDiff(refresh);
  const modelDisposable = args.editor.onDidChangeModelContent(refresh);
  const mouseMoveDisposable = args.editor.onMouseMove((event) => {
    if (
      event.target.type === args.monaco.editor.MouseTargetType.CONTENT_WIDGET &&
      event.target.element?.closest(".stave-diff-comment-hover-menu-host")
    ) {
      return;
    }
    setHoveredLine(
      resolveDiffReviewHoverLine({
        line: event.target.position?.lineNumber,
        isLineTarget: lineTargetTypes.has(event.target.type),
        commentableLines,
        threadLines,
      }),
    );
  });
  const mouseLeaveDisposable = args.editor.onMouseLeave(() => {
    setHoveredLine(undefined);
  });
  const mouseDownDisposable = args.editor.onMouseDown((event) => {
    if (
      event.target.type !==
      args.monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
    ) {
      return;
    }
    const element = event.target.element as HTMLElement | null;
    if (!element?.closest?.(".stave-diff-comment-glyph-has-thread")) {
      return;
    }
    const line = event.target.position?.lineNumber;
    if (!line || !threadLines.has(line)) {
      return;
    }
    setHoveredLine(undefined);
    args.onAddComment(line);
  });

  refresh();

  return {
    updateThreadLines(lines) {
      threadLines = new Set(lines);
      refresh();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      diffDisposable.dispose();
      modelDisposable.dispose();
      mouseMoveDisposable.dispose();
      mouseLeaveDisposable.dispose();
      mouseDownDisposable.dispose();
      decorations.clear();
      args.editor.removeContentWidget(contentWidget);
      root.unmount();
    },
  };
}
