import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorReviewPanel } from "@/components/layout/EditorReviewPanel";
import { buildDiffReviewThreads } from "@/components/layout/editor-diff-review";
import {
  captureReviewCommentAnchor,
  classifySentReviewComment,
} from "@/lib/sent-review-comments";
import type { ReviewComment } from "@/types/review";

const FILE = ["import x from \"x\";", "", "export function total(items) {", "  return items.length;", "}", ""].join("\n");
const comment: ReviewComment = {
  id: "c-1",
  filePath: "src/total.ts",
  line: 4,
  side: "modified",
  body: "Sum the amounts, not the count.",
  createdAt: "2026-10-21T00:00:00.000Z",
};

describe("sent review comment anchors", () => {
  test("captures the commented line with its neighbours", () => {
    expect(captureReviewCommentAnchor(FILE, 4)).toEqual(["export function total(items) {", "  return items.length;", "}"]);
    expect(captureReviewCommentAnchor(FILE, 1)).toEqual([null, "import x from \"x\";", ""]);
    expect(captureReviewCommentAnchor(FILE, 40)).toBeNull();
    expect(captureReviewCommentAnchor(undefined, 4)).toBeNull();
  });

  test("an untouched line, even moved a little, reads as not changed", () => {
    const anchor = captureReviewCommentAnchor(FILE, 4);
    expect(classifySentReviewComment({ anchor, line: 4, currentLines: FILE.split("\n") })).toBe("unchanged");
    const moved = ["// header", "// more", ...FILE.split("\n")];
    expect(classifySentReviewComment({ anchor, line: 4, currentLines: moved })).toBe("unchanged");
  });

  test("an edited or removed line reads as changed", () => {
    const anchor = captureReviewCommentAnchor(FILE, 4);
    const edited = FILE.replace("return items.length;", "return items.reduce((sum, item) => sum + item.amount, 0);").split("\n");
    expect(classifySentReviewComment({ anchor, line: 4, currentLines: edited })).toBe("changed");
    const removed = FILE.split("\n").filter((line) => line !== "  return items.length;");
    expect(classifySentReviewComment({ anchor, line: 4, currentLines: removed })).toBe("changed");
  });

  test("a comment sent without its file text has no change state", () => {
    expect(classifySentReviewComment({ anchor: null, line: 4, currentLines: FILE.split("\n") })).toBe("unknown");
  });
});

describe("sent comments in the diff", () => {
  test("a sent comment stays on its line, or the last line when the file got shorter", () => {
    const threads = buildDiffReviewThreads({
      comments: [],
      sentComments: [{ comment, state: "changed" }, { comment: { ...comment, id: "c-2", line: 90 }, state: "unknown" }],
      draft: null,
      lineCount: 6,
    });
    expect(threads.map((thread) => [thread.line, thread.sent.map((entry) => entry.comment.id)])).toEqual([
      [4, ["c-1"]],
      [6, ["c-2"]],
    ]);
  });

  test("the review panel shows what was sent, whether it changed, and a Resolve action", () => {
    const html = renderToStaticMarkup(
      createElement(EditorReviewPanel, {
        line: 4,
        comments: [],
        sentComments: [{ comment, state: "changed" }],
        draft: null,
        onStartDraft: () => undefined,
        onDraftBodyChange: () => undefined,
        onCancelDraft: () => undefined,
        onSubmitDraft: () => undefined,
        onRemoveComment: () => undefined,
        onResolveSentComment: () => undefined,
      }),
    );
    expect(html).toContain("Sent · lines changed since");
    expect(html).toContain("Sum the amounts, not the count.");
    expect(html).toContain('aria-label="Resolve the sent comment on line 4"');
    expect(html).toContain("1 sent");
  });
});
