import type { ReviewComment } from "@/types/review";

/**
 * The commented line with its neighbours, as the file read when the comment
 * was sent. `null` neighbours sit past the start or end of the file.
 */
export type ReviewCommentAnchor = readonly [before: string | null, line: string, after: string | null];

export function captureReviewCommentAnchor(
  content: string | undefined,
  line: number | undefined,
): ReviewCommentAnchor | null {
  if (content === undefined || !line || line < 1) {
    return null;
  }
  const lines = content.split("\n");
  const index = line - 1;
  if (index >= lines.length) {
    return null;
  }
  return [lines[index - 1] ?? null, lines[index]!, lines[index + 1] ?? null];
}

export type SentReviewCommentState = "unchanged" | "changed" | "unknown";

/** How far an unchanged anchor may have moved, as lines were added or removed above it. */
const ANCHOR_DRIFT = 3;

/**
 * Whether the commented lines still read as they did when the comment was
 * sent. Stave only says that they changed; whether that addressed the comment
 * is the reviewer's call.
 */
export function classifySentReviewComment(args: {
  anchor: ReviewCommentAnchor | null;
  line: number | undefined;
  currentLines: readonly string[];
}): SentReviewCommentState {
  if (!args.anchor || !args.line) {
    return "unknown";
  }
  const [before, text, after] = args.anchor;
  const center = args.line - 1;
  for (let offset = 0; offset <= ANCHOR_DRIFT; offset += 1) {
    for (const index of offset === 0 ? [center] : [center - offset, center + offset]) {
      if (index < 0 || index >= args.currentLines.length || args.currentLines[index] !== text) {
        continue;
      }
      // A missing neighbour (the anchor was the first or last line) matches anything.
      const beforeMatches = before === null || args.currentLines[index - 1] === before;
      const afterMatches = after === null || args.currentLines[index + 1] === after;
      if (beforeMatches && afterMatches) {
        return "unchanged";
      }
    }
  }
  return "changed";
}

export interface SentReviewComment {
  comment: ReviewComment;
  sentAt: string;
  anchor: ReviewCommentAnchor | null;
}

export interface SentReviewCommentView {
  comment: ReviewComment;
  state: SentReviewCommentState;
}
