import { z } from "zod";

/**
 * Managing a pull request after it exists: one strict, discriminated request
 * shared by the renderer, the IPC schema and the host runtime. Every action
 * names its pull request by URL; nothing here falls back to "the branch's PR".
 */
export const GITHUB_PR_MANAGE_LIMITS = {
  maxUrlChars: 2048,
  maxTitleChars: 256,
  /** GitHub's own limit for a pull request body. */
  maxBodyChars: 65_536,
  maxReviewerChanges: 15,
  maxQueryChars: 64,
  maxCandidates: 20,
  /** A failure carries the first stderr line, cut to this length. */
  maxDetailChars: 300,
} as const;

const PR_URL = /^https:\/\/[a-z0-9.-]+\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*$/i;
// A login never starts with a hyphen, so a handle can never read as an option.
const USER_HANDLE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const TEAM_HANDLE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** An explicit pull request URL: never a branch name, a number or a `gh` option. */
export function isGitHubPrManageUrl(url: unknown): url is string {
  return typeof url === "string" && url.length <= GITHUB_PR_MANAGE_LIMITS.maxUrlChars && PR_URL.test(url);
}

/** A user login, or a team as `org/team`. */
export function isGitHubReviewerHandle(value: unknown): value is string {
  return typeof value === "string" && (USER_HANDLE.test(value) || TEAM_HANDLE.test(value));
}

/** What a person typed (`@octocat`, ` org/team `) as a handle, or null when it is not one. */
export function normalizeGitHubReviewerHandle(input: string): string | null {
  const handle = input.trim().replace(/^@/, "");
  return isGitHubReviewerHandle(handle) ? handle : null;
}

const sameHandle = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The reviewer requests to add and remove to get from `before` to `after`; handles compare without case. */
export function diffGitHubPrReviewers(before: readonly string[], after: readonly string[]) {
  return {
    add: after.filter((handle) => !before.some((other) => sameHandle(other, handle))),
    remove: before.filter((handle) => !after.some((other) => sameHandle(other, handle))),
  };
}

const target = {
  prUrl: z.string().refine(isGitHubPrManageUrl),
  cwd: z.string().max(4096).optional(),
};
const hasControlCharacter = (value: string) =>
  Array.from(value).some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f);
const title = z.string().max(GITHUB_PR_MANAGE_LIMITS.maxTitleChars)
  .refine((value) => value.trim().length > 0 && !hasControlCharacter(value));
const body = z.string().max(GITHUB_PR_MANAGE_LIMITS.maxBodyChars);
const reviewers = z.array(z.string().refine(isGitHubReviewerHandle)).max(GITHUB_PR_MANAGE_LIMITS.maxReviewerChanges);
const query = z.string().max(GITHUB_PR_MANAGE_LIMITS.maxQueryChars).refine((value) => !hasControlCharacter(value));
const headOid = z.string().min(7).max(64).regex(/^[0-9a-fA-F]+$/);

export const GITHUB_PR_AUTO_MERGE_METHODS = ["merge", "squash", "rebase"] as const;

export const GitHubPrManageArgsSchema = z.discriminatedUnion("action", [
  z.object({ ...target, action: z.literal("details") }).strict(),
  z.object({ ...target, action: z.literal("edit"), title: title.optional(), body: body.optional() }).strict(),
  z.object({ ...target, action: z.literal("reviewers"), add: reviewers, remove: reviewers }).strict(),
  z.object({ ...target, action: z.literal("reviewer-candidates"), query: query.optional() }).strict(),
  z.object({ ...target, action: z.literal("draft") }).strict(),
  z.object({
    ...target,
    action: z.literal("auto-merge"),
    enabled: z.boolean(),
    method: z.enum(GITHUB_PR_AUTO_MERGE_METHODS).optional(),
    /** Head commit the queued merge must still point at (`--match-head-commit`). */
    expectedHeadOid: headOid.optional(),
  }).strict(),
  z.object({ ...target, action: z.literal("close") }).strict(),
  z.object({ ...target, action: z.literal("reopen") }).strict(),
]).superRefine((value, context) => {
  const reject = (message: string) => context.addIssue({ code: "custom", message });
  if (value.action === "edit" && value.title === undefined && value.body === undefined) {
    reject("edit needs a title or a body");
  }
  if (value.action === "reviewers") {
    if (value.add.length + value.remove.length === 0) reject("reviewers needs a change");
    if (value.add.some((handle) => value.remove.some((other) => sameHandle(other, handle)))) {
      reject("a reviewer cannot be added and removed at once");
    }
  }
  if (value.action === "auto-merge") {
    if (value.enabled && (!value.method || !value.expectedHeadOid)) {
      reject("turning auto-merge on needs a method and the expected head commit");
    }
    if (!value.enabled && (value.method !== undefined || value.expectedHeadOid !== undefined)) {
      reject("turning auto-merge off takes no method or head commit");
    }
  }
});

export type GitHubPrManageArgs = z.infer<typeof GitHubPrManageArgsSchema>;
export type GitHubPrManageAction = GitHubPrManageArgs["action"];

export interface GitHubPrManageReviewer {
  /** A user login, or `org/team` for a team. */
  handle: string;
  kind: "user" | "team";
}

export interface GitHubPrManageDetails {
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  authorLogin: string;
  /** Null while auto-merge is off. */
  autoMerge: { mergeMethod: string; enabledBy: string } | null;
  reviewRequests: GitHubPrManageReviewer[];
  latestReviews: { login: string; state: string }[];
  headRefOid: string;
  baseRefName: string;
}

export interface GitHubPrReviewerCandidate {
  login: string;
  name: string;
  /** GitHub suggests this person for this pull request. */
  suggested: boolean;
}

export type GitHubPrManageFailureReason =
  | "invalid-target"
  | "missing-gh"
  | "unauthenticated"
  | "timeout"
  | "invalid-response"
  | "failed";

export interface GitHubPrManageFailure {
  ok: false;
  reason: GitHubPrManageFailureReason;
  /** The first line `gh` printed, for `failed`. */
  detail?: string;
}

export type GitHubPrManageResult =
  | GitHubPrManageFailure
  | { ok: true; kind: "details"; details: GitHubPrManageDetails }
  /**
   * Suggestions are a convenience: when they cannot be read the list is empty
   * and `unavailable` says why, so the dialog falls back to typing a login.
   */
  | { ok: true; kind: "reviewer-candidates"; candidates: GitHubPrReviewerCandidate[]; unavailable?: Omit<GitHubPrManageFailure, "ok"> }
  | { ok: true; kind: "written" };

export type GitHubPrManageRequest = (args: GitHubPrManageArgs) => Promise<GitHubPrManageResult>;
