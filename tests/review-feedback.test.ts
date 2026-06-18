import { describe, expect, test } from "bun:test";
import {
  buildReviewFeedbackFileContexts,
  formatReviewFeedbackPrompt,
} from "@/lib/review-feedback";
import type { ReviewComment } from "@/types/review";

describe("review feedback formatting", () => {
  test("formats comments deterministically by file and line", () => {
    const comments: ReviewComment[] = [
      {
        id: "comment-2",
        filePath: "src/b.ts",
        line: 4,
        side: "modified",
        body: "Handle the empty state.",
        createdAt: "2026-06-18T01:00:01.000Z",
      },
      {
        id: "comment-1",
        filePath: "src/a.ts",
        line: 12,
        side: "modified",
        body: "Please simplify this branch.\nIt is doing two jobs.",
        createdAt: "2026-06-18T01:00:00.000Z",
      },
    ];

    expect(formatReviewFeedbackPrompt({ comments })).toBe(
      [
        "Review feedback",
        "",
        "Please address the following diff review comments.",
        "",
        "File: src/a.ts",
        "- modified line 12:",
        "  Please simplify this branch.",
        "  It is doing two jobs.",
        "",
        "File: src/b.ts",
        "- modified line 4:",
        "  Handle the empty state.",
      ].join("\n"),
    );
  });

  test("builds file contexts only for ready text editor tabs", () => {
    const comments: ReviewComment[] = [
      {
        id: "comment-1",
        filePath: "src/a.ts",
        line: 3,
        side: "modified",
        body: "Keep this typed.",
        createdAt: "2026-06-18T01:00:00.000Z",
      },
      {
        id: "comment-2",
        filePath: "src/image.png",
        body: "Not attachable.",
        createdAt: "2026-06-18T01:00:01.000Z",
      },
    ];

    expect(
      buildReviewFeedbackFileContexts({
        comments,
        editorTabs: [
          {
            id: "tab-a",
            filePath: "src/a.ts",
            language: "typescript",
            content: "const value = 1;\n",
            hasConflict: false,
            isDirty: false,
          },
          {
            id: "tab-image",
            filePath: "src/image.png",
            kind: "image",
            language: "image",
            content: "data:image/png;base64,",
            hasConflict: false,
            isDirty: false,
          },
        ],
      }),
    ).toEqual([
      {
        filePath: "src/a.ts",
        content: "const value = 1;\n",
        language: "typescript",
        instruction: "Review comments for this file:\n- modified line 3: Keep this typed.",
      },
    ]);
  });
});

