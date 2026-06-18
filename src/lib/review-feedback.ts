import type { EditorTab } from "@/types/chat";
import type { ReviewComment } from "@/types/review";

export interface ReviewFeedbackFileContext {
  filePath: string;
  content: string;
  language: string;
  instruction: string;
}

function normalizeCommentBody(body: string) {
  return body
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function normalizeLine(line: number | undefined) {
  if (typeof line !== "number" || !Number.isInteger(line) || line < 1) {
    return undefined;
  }
  return line;
}

function compareReviewComments(left: ReviewComment, right: ReviewComment) {
  const fileCompare = left.filePath.localeCompare(right.filePath);
  if (fileCompare !== 0) {
    return fileCompare;
  }

  const leftLine = normalizeLine(left.line) ?? Number.MAX_SAFE_INTEGER;
  const rightLine = normalizeLine(right.line) ?? Number.MAX_SAFE_INTEGER;
  if (leftLine !== rightLine) {
    return leftLine - rightLine;
  }

  const createdCompare = left.createdAt.localeCompare(right.createdAt);
  if (createdCompare !== 0) {
    return createdCompare;
  }

  return left.id.localeCompare(right.id);
}

export function normalizeReviewComments(comments: ReviewComment[]) {
  return comments
    .map((comment) => ({
      ...comment,
      filePath: comment.filePath.trim(),
      line: normalizeLine(comment.line),
      body: normalizeCommentBody(comment.body),
    }))
    .filter((comment) => comment.filePath && comment.body)
    .sort(compareReviewComments);
}

function formatLocation(comment: ReviewComment) {
  const side = comment.side === "original" ? "original" : "modified";
  if (comment.line) {
    return `${side} line ${comment.line}`;
  }
  return side;
}

function formatBodyBlock(body: string) {
  return body
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

export function formatReviewFeedbackPrompt(args: {
  comments: ReviewComment[];
}) {
  const comments = normalizeReviewComments(args.comments);
  if (comments.length === 0) {
    return "";
  }

  const lines = [
    "Review feedback",
    "",
    "Please address the following diff review comments.",
    "",
  ];
  let currentFilePath: string | null = null;

  for (const comment of comments) {
    if (comment.filePath !== currentFilePath) {
      if (currentFilePath) {
        lines.push("");
      }
      currentFilePath = comment.filePath;
      lines.push(`File: ${comment.filePath}`);
    }
    lines.push(`- ${formatLocation(comment)}:`);
    lines.push(formatBodyBlock(comment.body));
  }

  return lines.join("\n");
}

export function formatReviewFeedbackFileInstruction(args: {
  filePath: string;
  comments: ReviewComment[];
}) {
  const comments = normalizeReviewComments(args.comments).filter(
    (comment) => comment.filePath === args.filePath,
  );
  if (comments.length === 0) {
    return "";
  }

  const lines = ["Review comments for this file:"];
  for (const comment of comments) {
    lines.push(`- ${formatLocation(comment)}: ${comment.body}`);
  }
  return lines.join("\n");
}

export function buildReviewFeedbackFileContexts(args: {
  comments: ReviewComment[];
  editorTabs: EditorTab[];
}): ReviewFeedbackFileContext[] {
  const comments = normalizeReviewComments(args.comments);
  const filePaths = Array.from(
    new Set(comments.map((comment) => comment.filePath)),
  );

  return filePaths.flatMap((filePath) => {
    const tab = args.editorTabs.find(
      (candidate) =>
        candidate.filePath === filePath &&
        candidate.kind !== "image" &&
        candidate.language !== "image" &&
        (!candidate.contentState || candidate.contentState === "ready"),
    );
    if (!tab) {
      return [];
    }

    const instruction = formatReviewFeedbackFileInstruction({
      filePath,
      comments,
    });
    if (!instruction) {
      return [];
    }

    return [
      {
        filePath,
        content: tab.content,
        language: tab.language,
        instruction,
      },
    ];
  });
}
