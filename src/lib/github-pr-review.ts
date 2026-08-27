export const GITHUB_PR_REVIEW_LIMITS = Object.freeze({
  maxInboxItems: 50,
  maxTitleChars: 500,
  maxBodyChars: 60_000,
  maxReviewBodyChars: 60_000,
  maxTimelineItems: 50,
  maxFiles: 100,
  maxPathChars: 1_024,
  maxPatchChars: 100_000,
  maxUrlChars: 2_048,
  maxLoginChars: 128,
  maxRepositoryChars: 256,
  maxTimestampChars: 64,
});

export type GitHubPrInboxKind = "review-requested" | "authored";
export type GitHubPrReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export const GITHUB_PR_DIFF_TAB_PREFIX = "github-pr-diff:";

export function githubPrDiffTabId(args: {
  repositoryWithOwner: string;
  number: number;
  headOid: string;
  filePath: string;
}) {
  return `${GITHUB_PR_DIFF_TAB_PREFIX}${encodeURIComponent(args.repositoryWithOwner)}:${args.number}:${args.headOid}:${encodeURIComponent(args.filePath)}`;
}

export interface GitHubPrInboxItem {
  number: number;
  title: string;
  url: string;
  repositoryWithOwner: string;
  authorLogin: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  commentsCount: number;
}

export interface GitHubPrReviewTimelineItem {
  id: string;
  kind: "review" | "comment";
  authorLogin: string;
  body: string;
  state: string;
  createdAt: string;
  url: string;
}

export interface GitHubPrCheck {
  name: string;
  status: string;
  conclusion: string;
  detailsUrl: string;
}

export interface GitHubPrFile {
  path: string;
  previousPath: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
  patchTruncated: boolean;
}

export interface GitHubPrReviewDetail {
  number: number;
  title: string;
  body: string;
  url: string;
  repositoryWithOwner: string;
  authorLogin: string;
  viewerLogin: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  baseRefName: string;
  baseRefOid: string;
  headRefName: string;
  headRefOid: string;
  reviewDecision: string;
  mergeable: string;
  mergeStateStatus: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: GitHubPrFile[];
  filesTruncated: boolean;
  filesError: string;
  timeline: GitHubPrReviewTimelineItem[];
  checks: GitHubPrCheck[];
}

export interface GitHubPrInboxResult {
  ok: boolean;
  items: GitHubPrInboxItem[];
  viewerLogin: string;
  stderr: string;
}

export interface GitHubPrReviewDetailResult {
  ok: boolean;
  detail: GitHubPrReviewDetail | null;
  stderr: string;
}

export interface GitHubPrReviewSubmitResult {
  ok: boolean;
  stale: boolean;
  currentHeadOid: string;
  reviewId: number | null;
  reviewUrl: string;
  stderr: string;
}
