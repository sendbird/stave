import { z } from "zod";
import {
  GITHUB_PR_MANAGE_LIMITS,
  isGitHubReviewerHandle,
  type GitHubPrManageArgs,
  type GitHubPrManageDetails,
  type GitHubPrManageFailure,
  type GitHubPrManageResult,
  type GitHubPrManageReviewer,
  type GitHubPrReviewerCandidate,
} from "../../src/lib/github-pr-manage";
import { sanitizePrContextText } from "../../src/lib/pr-context";
import { runCommandArgs } from "../main/utils/command";
import { ensureGhAuth } from "./gh-auth";
import { invalidateCachedGhAuthOnFailure, isPrActionUrl, type ScmCommandRunner } from "./scm-runtime";

type CommandOutcome = Awaited<ReturnType<ScmCommandRunner>>;
type Candidates = Extract<GitHubPrManageArgs, { action: "reviewer-candidates" }>;
type GhCommand = Exclude<GitHubPrManageArgs, Candidates>;

const DETAILS_FIELDS = [
  "number", "title", "body", "state", "isDraft", "author", "autoMergeRequest",
  "reviewRequests", "latestReviews", "headRefOid", "baseRefName",
].join(",");

// i18n-ignore: GraphQL document sent to the GitHub API
const REVIEWER_CANDIDATES = `query($owner:String!,$repo:String!,$number:Int!,$search:String){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$number){ author{login} suggestedReviewers{reviewer{login name}} }
    assignableUsers(first:${GITHUB_PR_MANAGE_LIMITS.maxCandidates},query:$search){nodes{login name}}
  }
}`;

/** Host, owner, repository and number of an explicit pull request URL. */
export function parseGitHubPrManageTarget(prUrl: unknown) {
  if (!isPrActionUrl(prUrl)) return null;
  const url = new URL(prUrl);
  const [owner, repo, , number] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo || !number) return null;
  return { host: url.hostname.toLowerCase(), owner, repo, number: Number(number) };
}

/**
 * The `gh` arguments of one action. Every command names the pull request by
 * URL, and none of them removes a branch: closing or merging here leaves the
 * head branch where it is.
 */
export function buildGitHubPrManageArgs(args: GhCommand): string[] {
  const { prUrl } = args;
  switch (args.action) {
    case "details":
      return ["pr", "view", prUrl, "--json", DETAILS_FIELDS];
    case "edit":
      return [
        "pr", "edit", prUrl,
        ...(args.title !== undefined ? ["--title", args.title] : []),
        ...(args.body !== undefined ? ["--body", args.body] : []),
      ];
    case "reviewers":
      return [
        "pr", "edit", prUrl,
        ...(args.add.length ? ["--add-reviewer", args.add.join(",")] : []),
        ...(args.remove.length ? ["--remove-reviewer", args.remove.join(",")] : []),
      ];
    case "draft":
      return ["pr", "ready", prUrl, "--undo"];
    case "auto-merge":
      return args.enabled
        ? ["pr", "merge", prUrl, "--auto", `--${args.method}`, "--match-head-commit", args.expectedHeadOid ?? ""]
        : ["pr", "merge", prUrl, "--disable-auto"];
    case "close":
      return ["pr", "close", prUrl];
    case "reopen":
      return ["pr", "reopen", prUrl];
  }
}

export function buildGitHubPrReviewerCandidateArgs(
  target: NonNullable<ReturnType<typeof parseGitHubPrManageTarget>>,
  query?: string,
) {
  const search = query?.trim();
  return [
    "api", "graphql", "--hostname", target.host,
    "-f", `query=${REVIEWER_CANDIDATES}`,
    "-f", `owner=${target.owner}`,
    "-f", `repo=${target.repo}`,
    "-F", `number=${target.number}`,
    // A raw field: gh sends the text as typed and never reads it as a file.
    ...(search ? ["-f", `search=${search}`] : []),
  ];
}

const login = z.object({ login: z.string() }).nullish();
const detailsSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullish(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  author: login,
  autoMergeRequest: z.object({ mergeMethod: z.string().nullish(), enabledBy: login }).nullish(),
  reviewRequests: z.array(z.object({
    __typename: z.string().nullish(),
    login: z.string().nullish(),
    slug: z.string().nullish(),
  })).nullish(),
  latestReviews: z.array(z.object({ author: login, state: z.string().nullish() })).nullish(),
  headRefOid: z.string(),
  baseRefName: z.string(),
});

/** `gh pr view --json` output as the fields the menu and the edit dialog read. */
export function parseGitHubPrManageDetails(input: unknown, owner: string): GitHubPrManageDetails {
  const pr = detailsSchema.parse(input);
  const reviewRequests: GitHubPrManageReviewer[] = [];
  for (const request of pr.reviewRequests ?? []) {
    const team = request.__typename === "Team";
    // gh reports a team as `org/team`; an older build reports the bare slug.
    const handle = team
      ? (request.slug?.includes("/") ? request.slug : `${owner}/${request.slug ?? ""}`)
      : request.login ?? "";
    if (isGitHubReviewerHandle(handle) && !reviewRequests.some((other) => other.handle === handle)) {
      reviewRequests.push({ handle, kind: team ? "team" : "user" });
    }
  }
  return {
    number: pr.number,
    title: pr.title.slice(0, GITHUB_PR_MANAGE_LIMITS.maxTitleChars),
    body: (pr.body ?? "").slice(0, GITHUB_PR_MANAGE_LIMITS.maxBodyChars),
    state: pr.state,
    isDraft: pr.isDraft,
    authorLogin: pr.author?.login ?? "",
    autoMerge: pr.autoMergeRequest
      ? {
          mergeMethod: (pr.autoMergeRequest.mergeMethod ?? "").slice(0, 32),
          enabledBy: pr.autoMergeRequest.enabledBy?.login ?? "",
        }
      : null,
    reviewRequests,
    latestReviews: (pr.latestReviews ?? [])
      .filter((review) => review.author?.login)
      .slice(0, 50)
      .map((review) => ({ login: review.author!.login, state: (review.state ?? "").slice(0, 32) })),
    headRefOid: pr.headRefOid,
    baseRefName: pr.baseRefName,
  };
}

const user = z.object({ login: z.string(), name: z.string().nullish() }).nullish();
const candidatesSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        author: login,
        suggestedReviewers: z.array(z.object({ reviewer: user }).nullable()).nullish(),
      }).nullish(),
      assignableUsers: z.object({ nodes: z.array(user).nullish() }).nullish(),
    }).nullish(),
  }).nullish(),
});

/** Suggested reviewers first, then assignable users; never the author, never twice. */
export function parseGitHubPrReviewerCandidates(input: unknown, query?: string): GitHubPrReviewerCandidate[] {
  const repository = candidatesSchema.parse(input).data?.repository;
  const author = repository?.pullRequest?.author?.login.toLowerCase();
  const search = query?.trim().toLowerCase() ?? "";
  const candidates = new Map<string, GitHubPrReviewerCandidate>();
  const add = (person: z.infer<typeof user>, suggested: boolean) => {
    if (!person || !isGitHubReviewerHandle(person.login)) return;
    const key = person.login.toLowerCase();
    if (key === author || candidates.has(key)) return;
    const name = sanitizePrContextText(person.name ?? "", 128);
    // GitHub filters assignable users itself; suggestions arrive unfiltered.
    if (suggested && search && !`${key} ${name.toLowerCase()}`.includes(search)) return;
    candidates.set(key, { login: person.login, name, suggested });
  };
  for (const suggestion of repository?.pullRequest?.suggestedReviewers ?? []) add(suggestion?.reviewer, true);
  for (const person of repository?.assignableUsers?.nodes ?? []) add(person, false);
  return [...candidates.values()].slice(0, GITHUB_PR_MANAGE_LIMITS.maxCandidates);
}

function firstLine(text: string) {
  const line = sanitizePrContextText(text, Number.POSITIVE_INFINITY).split("\n").find((part) => part.trim());
  return (line ?? "").trim().slice(0, GITHUB_PR_MANAGE_LIMITS.maxDetailChars);
}

function describeFailure(result: CommandOutcome, fallback: GitHubPrManageFailure["reason"] = "failed"): GitHubPrManageFailure {
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (/spawn gh ENOENT|command not found|not recognized/i.test(output)) return { ok: false, reason: "missing-gh" };
  if (/authentication failed|not logged (?:in|into)|gh auth login|not authenticated|HTTP 401/i.test(output)) {
    return { ok: false, reason: "unauthenticated" };
  }
  if (result.code === -1 && /Command timed out after/i.test(result.stderr ?? "")) return { ok: false, reason: "timeout" };
  if (fallback !== "failed") return { ok: false, reason: fallback };
  const detail = firstLine(result.stderr ?? "") || firstLine(result.stdout ?? "");
  return { ok: false, reason: "failed", ...(detail ? { detail } : {}) };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function run(args: GitHubPrManageArgs, runCommand: ScmCommandRunner): Promise<GitHubPrManageResult> {
  const target = parseGitHubPrManageTarget(args.prUrl);
  if (!target) return { ok: false, reason: "invalid-target" };
  const { cwd } = args;

  const auth = await ensureGhAuth({ cwd, runCommand });
  if (!auth.ok) return describeFailure(auth, "unauthenticated");

  const gh = async (commandArgs: string[]) => {
    const result = await runCommand({
      command: "gh",
      commandArgs,
      cwd,
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
      timeoutMs: 30_000,
    });
    invalidateCachedGhAuthOnFailure(result, cwd);
    return result;
  };

  if (args.action === "reviewer-candidates") {
    const result = await gh(buildGitHubPrReviewerCandidateArgs(target, args.query));
    // GitHub can answer one field and refuse another; keep whatever it returned.
    const parsed = candidatesSchema.safeParse(parseJson(result.stdout));
    const candidates = parsed.success ? parseGitHubPrReviewerCandidates(parsed.data, args.query) : [];
    if (result.ok && parsed.success) return { ok: true, kind: "reviewer-candidates", candidates };
    if (candidates.length) return { ok: true, kind: "reviewer-candidates", candidates };
    return result.ok ? { ok: false, reason: "invalid-response" } : describeFailure(result);
  }

  const result = await gh(buildGitHubPrManageArgs(args));
  if (!result.ok) return describeFailure(result);
  if (args.action !== "details") return { ok: true, kind: "written" };
  try {
    return { ok: true, kind: "details", details: parseGitHubPrManageDetails(JSON.parse(result.stdout), target.owner) };
  } catch {
    return { ok: false, reason: "invalid-response" };
  }
}

/**
 * Reads or changes one pull request through `gh`. Never throws: a failure is a
 * reason code plus the first line `gh` printed. Reviewer suggestions degrade to
 * an empty list instead of failing, so the dialog can still take a typed login.
 */
export async function runGitHubPrManage(
  args: GitHubPrManageArgs,
  runCommand: ScmCommandRunner = runCommandArgs,
): Promise<GitHubPrManageResult> {
  const outcome = await run(args, runCommand).catch((): GitHubPrManageFailure => ({ ok: false, reason: "failed" }));
  if (args.action === "reviewer-candidates" && !outcome.ok) {
    const { reason, detail } = outcome;
    return { ok: true, kind: "reviewer-candidates", candidates: [], unavailable: { reason, ...(detail ? { detail } : {}) } };
  }
  return outcome;
}
