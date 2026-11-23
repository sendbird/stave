import { z } from "zod";
import { GITHUB_PR_REVIEW_LIMITS } from "./github-pr-review";
import { PR_CONTEXT_LIMITS, parsePrContextUrl, type PrReviewComment, type PrReviewThread } from "./pr-context";

export const GITHUB_PR_LOG_MAX_BYTES = 16 * 1024;
export const GITHUB_PR_MAX_RUNS = 30;
export const GITHUB_PR_MAX_JOBS = 50;

export function parseGitHubPrActivityRef(url: string) {
  const ref = parsePrContextUrl(url);
  if (!ref || ref.number < 1 || !/^[\w-]+$/.test(ref.owner) || ref.repo === "." || ref.repo === "..") {
    return null;
  }
  return ref;
}

const target = {
  prUrl: z.string().max(GITHUB_PR_REVIEW_LIMITS.maxUrlChars).refine((url) => !!parseGitHubPrActivityRef(url)),
  cwd: z.string().max(4096).optional(),
};
const body = z.string().max(GITHUB_PR_REVIEW_LIMITS.maxBodyChars).refine((value) => value.trim().length > 0);
const threadId = z.string().min(1).max(PR_CONTEXT_LIMITS.maxNameChars).regex(/^[A-Za-z0-9_+=/-]+$/);
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const GitHubPrActivityArgsSchema = z.discriminatedUnion("action", [
  z.object({ ...target, action: z.literal("discussion") }).strict(),
  z.object({ ...target, action: z.literal("comment"), body }).strict(),
  z.object({ ...target, action: z.literal("reply"), threadId, body }).strict(),
  z.object({ ...target, action: z.literal("resolve"), threadId, resolved: z.boolean() }).strict(),
  z.object({ ...target, action: z.literal("runs") }).strict(),
  z.object({ ...target, action: z.literal("jobs"), runId: id }).strict(),
  z.object({ ...target, action: z.literal("log"), runId: id, jobId: id }).strict(),
  z.object({ ...target, action: z.literal("rerun"), runId: id, attempt: id }).strict(),
]);

export type GitHubPrActivityArgs = z.infer<typeof GitHubPrActivityArgsSchema>;

export interface GitHubPrWorkflowRun {
  id: number;
  name: string;
}

export interface GitHubPrWorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion: string;
  failedSteps: { number: number; name: string }[];
}

export type GitHubPrActivityFailure = {
  ok: false;
  reason: "missing-gh" | "unauthenticated" | "failed" | "invalid-response" | "oversized-response"
    | "wrong-thread" | "thread-permission" | "unlinked-run" | "invalid-job" | "stale-run" | "timeout";
  detail?: string;
};

export type GitHubPrActivityResult =
  | GitHubPrActivityFailure
  | { ok: true; kind: "discussion"; threads: PrReviewThread[]; omittedThreads: number; comments: PrReviewComment[]; omittedComments: number }
  | { ok: true; kind: "runs"; runs: GitHubPrWorkflowRun[]; omitted: number; partial: boolean }
  | { ok: true; kind: "jobs"; attempt: number; status: string; conclusion: string; jobs: GitHubPrWorkflowJob[]; omitted: number }
  | { ok: true; kind: "log"; text: string; truncated: boolean }
  | { ok: true; kind: "written" };

export type GitHubPrActivityRequest = (args: GitHubPrActivityArgs) => Promise<GitHubPrActivityResult>;
