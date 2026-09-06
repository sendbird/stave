import type { editor as MonacoEditorApi } from "monaco-editor";
import { useLayoutEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorReviewPanel } from "@/components/layout/EditorReviewPanel";
import * as stylex from "@stylexjs/stylex";
import { layoutShellStyles } from "./layout-shell.styles";
import { createDiffReviewLineHoverController } from "@/components/layout/editor-diff-review-hover-menu";
import {
  buildDiffReviewThreads,
  registerDiffReviewCommentAction,
  type DiffReviewThread,
} from "@/components/layout/editor-diff-review";
import type { ReviewComment, ReviewCommentDraft } from "@/types/review";

type MonacoNamespace = typeof import("monaco-editor");

export interface DiffReviewControllerUpdate {
  comments: ReviewComment[];
  draft: ReviewCommentDraft | null;
  onStartDraft: (line: number) => void;
  onDraftBodyChange: (body: string) => void;
  onCancelDraft: () => void;
  onSubmitDraft: () => void;
  onRemoveComment: (commentId: string) => void;
}

export interface DiffReviewController {
  update: (args: DiffReviewControllerUpdate) => void;
  dispose: () => void;
}

interface MountedReviewZone {
  id: string;
  zone: MonacoEditorApi.IViewZone;
  root: Root;
}

function DiffReviewZone(args: {
  thread: DiffReviewThread;
  update: DiffReviewControllerUpdate;
  onHeightChange: (height: number) => void;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }
    const updateHeight = () => {
      const height = Math.max(
        1,
        Math.ceil(element.getBoundingClientRect().height),
      );
      args.onHeightChange(height);
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [args.onHeightChange]);

  return (
    <div ref={contentRef} {...stylex.props(layoutShellStyles.diffReview)}>
      <EditorReviewPanel
        line={args.thread.line}
        draft={args.thread.draft}
        comments={args.thread.comments}
        onStartDraft={() => args.update.onStartDraft(args.thread.line)}
        onDraftBodyChange={args.update.onDraftBodyChange}
        onCancelDraft={args.update.onCancelDraft}
        onSubmitDraft={args.update.onSubmitDraft}
        onRemoveComment={args.update.onRemoveComment}
      />
    </div>
  );
}

function createReviewZoneManager(args: {
  editor: MonacoEditorApi.IStandaloneCodeEditor;
}) {
  const mountedByLine = new Map<number, MountedReviewZone>();
  let disposed = false;

  const removeLine = (line: number) => {
    const mounted = mountedByLine.get(line);
    if (!mounted) {
      return;
    }
    mountedByLine.delete(line);
    mounted.root.unmount();
    args.editor.changeViewZones((accessor) => accessor.removeZone(mounted.id));
  };

  const renderThread = (
    mounted: MountedReviewZone,
    thread: DiffReviewThread,
    update: DiffReviewControllerUpdate,
  ) => {
    mounted.root.render(
      <DiffReviewZone
        thread={thread}
        update={update}
        onHeightChange={(height) => {
          if (disposed || mounted.zone.heightInPx === height) {
            return;
          }
          mounted.zone.heightInPx = height;
          args.editor.changeViewZones((accessor) => {
            accessor.layoutZone(mounted.id);
          });
        }}
      />,
    );
  };

  return {
    update(update: DiffReviewControllerUpdate) {
      if (disposed) {
        return;
      }
      const lineCount = args.editor.getModel()?.getLineCount() ?? 0;
      const threads = buildDiffReviewThreads({
        comments: update.comments,
        draft: update.draft,
        lineCount,
      });
      const nextLines = new Set(threads.map((thread) => thread.line));
      for (const line of mountedByLine.keys()) {
        if (!nextLines.has(line)) {
          removeLine(line);
        }
      }

      for (const thread of threads) {
        let mounted = mountedByLine.get(thread.line);
        if (!mounted) {
          const domNode = document.createElement("div");
          domNode.className = "stave-diff-review-zone";
          const zone: MonacoEditorApi.IViewZone = {
            afterLineNumber: thread.line,
            heightInPx: 48,
            domNode,
            showInHiddenAreas: true,
          };
          let id = "";
          args.editor.changeViewZones((accessor) => {
            id = accessor.addZone(zone);
          });
          mounted = {
            id,
            zone,
            root: createRoot(domNode),
          };
          mountedByLine.set(thread.line, mounted);
        }
        renderThread(mounted, thread, update);
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const line of [...mountedByLine.keys()]) {
        removeLine(line);
      }
    },
  };
}

export function createDiffReviewController(args: {
  diffEditor: MonacoEditorApi.IStandaloneDiffEditor;
  monaco: MonacoNamespace;
}): DiffReviewController {
  const editor = args.diffEditor.getModifiedEditor();
  let currentUpdate: DiffReviewControllerUpdate | null = null;
  const zones = createReviewZoneManager({ editor });
  const lineHover = createDiffReviewLineHoverController({
    diffEditor: args.diffEditor,
    editor,
    monaco: args.monaco,
    onAddComment: (line) => currentUpdate?.onStartDraft(line),
  });
  const action = registerDiffReviewCommentAction({
    editor,
    onAddComment: (target) => {
      const line = target.line ?? editor.getPosition()?.lineNumber;
      if (line) {
        currentUpdate?.onStartDraft(line);
      }
    },
  });

  return {
    update(update) {
      currentUpdate = update;
      zones.update(update);
      const threadLines = buildDiffReviewThreads({
        comments: update.comments,
        draft: update.draft,
        lineCount: editor.getModel()?.getLineCount() ?? 0,
      }).map((thread) => thread.line);
      lineHover.updateThreadLines(threadLines);
    },
    dispose() {
      currentUpdate = null;
      action.dispose();
      lineHover.dispose();
      zones.dispose();
    },
  };
}
