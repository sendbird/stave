import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorReviewPanel } from "@/components/layout/EditorReviewPanel";
import { DiffReviewHoverMenu } from "@/components/layout/editor-diff-review-hover-menu";
import {
  buildDiffReviewThreads,
  collectModifiedDiffCommentableLines,
  resolveDiffReviewHoverLine,
  resolveTaskReviewDraft,
  shouldRenderDiffEditorSurface,
} from "@/components/layout/editor-diff-review";
import type { ReviewComment } from "@/types/review";

const comments: ReviewComment[] = [
  {
    id: "comment-later",
    filePath: "src/example.ts",
    line: 8,
    side: "modified",
    body: "Second comment",
    createdAt: "2026-08-05T00:00:02.000Z",
  },
  {
    id: "comment-first",
    filePath: "src/example.ts",
    line: 8,
    side: "modified",
    body: "First comment",
    createdAt: "2026-08-05T00:00:01.000Z",
  },
  {
    id: "comment-original",
    filePath: "src/example.ts",
    line: 4,
    side: "original",
    body: "Original-side comment",
    createdAt: "2026-08-05T00:00:00.000Z",
  },
  {
    id: "comment-out-of-range",
    filePath: "src/example.ts",
    line: 99,
    side: "modified",
    body: "Stale comment",
    createdAt: "2026-08-05T00:00:03.000Z",
  },
];

describe("diff review line helpers", () => {
  test("keeps added files on the diff surface so line comments can mount", () => {
    expect(
      shouldRenderDiffEditorSurface({
        diffMode: true,
        originalContent: "",
      }),
    ).toBe(true);
    expect(
      shouldRenderDiffEditorSurface({
        diffMode: false,
        originalContent: "",
      }),
    ).toBe(false);
    expect(
      shouldRenderDiffEditorSurface({
        diffMode: true,
        originalContent: undefined,
      }),
    ).toBe(false);
  });

  test("collects unique modified lines and skips deletion-only changes", () => {
    expect(
      collectModifiedDiffCommentableLines([
        { modifiedStartLineNumber: 3, modifiedEndLineNumber: 5 },
        { modifiedStartLineNumber: 5, modifiedEndLineNumber: 6 },
        { modifiedStartLineNumber: 0, modifiedEndLineNumber: 0 },
      ]),
    ).toEqual([3, 4, 5, 6]);
  });

  test("groups modified comments and the active draft by line", () => {
    const threads = buildDiffReviewThreads({
      comments,
      draft: {
        filePath: "src/example.ts",
        line: 6,
        side: "modified",
        body: "Draft body",
      },
      lineCount: 20,
    });

    expect(threads.map((thread) => thread.line)).toEqual([6, 8]);
    expect(threads[0]?.draft?.body).toBe("Draft body");
    expect(threads[1]?.comments.map((comment) => comment.id)).toEqual([
      "comment-first",
      "comment-later",
    ]);
  });

  test("resolves hover menus only for line targets with comments or changes", () => {
    const commentableLines = new Set([3, 4]);
    const threadLines = new Set([8]);

    expect(
      resolveDiffReviewHoverLine({
        line: 3,
        isLineTarget: true,
        commentableLines,
        threadLines,
      }),
    ).toBe(3);
    expect(
      resolveDiffReviewHoverLine({
        line: 8,
        isLineTarget: true,
        commentableLines,
        threadLines,
      }),
    ).toBe(8);
    expect(
      resolveDiffReviewHoverLine({
        line: 7,
        isLineTarget: true,
        commentableLines,
        threadLines,
      }),
    ).toBeUndefined();
    expect(
      resolveDiffReviewHoverLine({
        line: 3,
        isLineTarget: false,
        commentableLines,
        threadLines,
      }),
    ).toBeUndefined();
  });

  test("keeps a draft scoped to the task that created it", () => {
    const draft = {
      filePath: "src/example.ts",
      line: 8,
      side: "modified" as const,
      body: "Task-specific draft",
    };

    expect(resolveTaskReviewDraft({ taskId: "task-a", draft }, "task-a")).toBe(
      draft,
    );
    expect(
      resolveTaskReviewDraft({ taskId: "task-a", draft }, "task-b"),
    ).toBeNull();
  });
});

describe("DiffReviewHoverMenu", () => {
  test("renders a compact hover action anchored to the modified line", () => {
    const html = renderToStaticMarkup(
      createElement(DiffReviewHoverMenu, {
        line: 8,
        hasThread: false,
        onAddComment: () => undefined,
      }),
    );

    expect(html).toContain('data-testid="diff-review-hover-menu"');
    expect(html).toContain('data-review-line="8"');
    expect(html).toContain('data-review-side="modified"');
    expect(html).toContain(
      'aria-label="Add review comment on modified line 8"',
    );
    expect(html).toContain('title="Add review comment on modified line 8"');
  });

  test("labels an existing thread as an additional comment", () => {
    const html = renderToStaticMarkup(
      createElement(DiffReviewHoverMenu, {
        line: 8,
        hasThread: true,
        onAddComment: () => undefined,
      }),
    );

    expect(html).toContain(
      'aria-label="Add another review comment on modified line 8"',
    );
  });
});

describe("EditorReviewPanel", () => {
  test("renders saved comments and a line-scoped draft form", () => {
    const html = renderToStaticMarkup(
      createElement(EditorReviewPanel, {
        line: 8,
        comments: comments.slice(0, 2),
        draft: {
          filePath: "src/example.ts",
          line: 8,
          side: "modified",
          body: "Draft body",
        },
        onStartDraft: () => undefined,
        onDraftBodyChange: () => undefined,
        onCancelDraft: () => undefined,
        onSubmitDraft: () => undefined,
        onRemoveComment: () => undefined,
      }),
    );

    expect(html).toContain('data-review-line="8"');
    expect(html).toContain('data-review-side="modified"');
    expect(html).toContain("Review comment");
    expect(html).toContain("Comment on");
    expect(html).toContain(">R8<");
    expect(html).toContain("First comment");
    expect(html).toContain("Second comment");
    expect(html).toContain('aria-label="Comment on modified line 8"');
    expect(html).toContain("Draft body");
    expect(html).toContain("Add comment");
  });
});
