export type ReviewCommentSide = "original" | "modified";

export interface ReviewComment {
  id: string;
  filePath: string;
  line?: number;
  side?: ReviewCommentSide;
  body: string;
  createdAt: string;
}

