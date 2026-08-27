import {
  GITHUB_PR_REVIEW_LIMITS,
  type GitHubPrCheck,
  type GitHubPrFile,
  type GitHubPrInboxItem,
  type GitHubPrInboxKind,
  type GitHubPrInboxResult,
  type GitHubPrReviewDetail,
  type GitHubPrReviewDetailResult,
  type GitHubPrReviewEvent,
  type GitHubPrReviewSubmitResult,
  type GitHubPrReviewTimelineItem,
} from "../../src/lib/github-pr-review";
import {
  parsePrContextUrl,
  sanitizePrContextText,
  stripControlSequences,
} from "../../src/lib/pr-context";
import { runCommandArgs } from "../main/utils/command";
import { ensureGhAuth, invalidateGhAuthCache } from "./gh-auth";

type RunCommand = typeof runCommandArgs;

const GH_TIMEOUT_MS = 60_000;
const GH_MAX_OUTPUT_CHARS = 4_000_000;

const DETAIL_FIELDS = [
  "number",
  "title",
  "body",
  "url",
  "author",
  "isDraft",
  "createdAt",
  "updatedAt",
  "baseRefName",
  "baseRefOid",
  "headRefName",
  "headRefOid",
  "reviewDecision",
  "mergeable",
  "mergeStateStatus",
  "additions",
  "deletions",
  "changedFiles",
  "latestReviews",
  "comments",
  "statusCheckRollup",
].join(",");

function invalidateAuthOnFailure(
  result: { ok: boolean; stdout?: string; stderr?: string },
  cwd?: string,
) {
  if (result.ok) {
    return;
  }
  const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (
    /authentication failed|not logged into|gh auth login|not authenticated/i.test(
      detail,
    )
  ) {
    invalidateGhAuthCache({ cwd });
  }
}

function describeGhFailure(result: { stdout?: string; stderr?: string }) {
  const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (/spawn gh ENOENT|command not found|not recognized/i.test(detail)) {
    return "GitHub CLI is not installed. Install `gh` first.";
  }
  if (
    /authentication failed|not logged into|gh auth login|not authenticated/i.test(
      detail,
    )
  ) {
    return "GitHub CLI is not authenticated. Run `gh auth login` first.";
  }
  return (
    sanitizePrContextText(result.stderr ?? "", 300).split("\n")[0] ||
    "GitHub request failed."
  );
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, maxChars: number) {
  return typeof value === "string"
    ? sanitizePrContextText(value, maxChars)
    : "";
}

function identifier(value: unknown, maxChars: number) {
  return typeof value === "string"
    ? stripControlSequences(value)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxChars)
    : "";
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function parseJsonObject(stdout: string): Record<string, unknown> | null {
  try {
    return objectValue(JSON.parse(stdout));
  } catch {
    return null;
  }
}

function parseJsonArray(stdout: string): unknown[] | null {
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function mapInboxItem(raw: unknown): GitHubPrInboxItem | null {
  const item = objectValue(raw);
  if (!item) {
    return null;
  }
  const repository = objectValue(item.repository);
  const author = objectValue(item.author);
  const number = integer(item.number);
  const url = identifier(item.url, GITHUB_PR_REVIEW_LIMITS.maxUrlChars);
  if (!number || !url || !parsePrContextUrl(url)) {
    return null;
  }
  return {
    number,
    title: text(item.title, GITHUB_PR_REVIEW_LIMITS.maxTitleChars),
    url,
    repositoryWithOwner: identifier(
      repository?.nameWithOwner,
      GITHUB_PR_REVIEW_LIMITS.maxRepositoryChars,
    ),
    authorLogin: identifier(
      author?.login,
      GITHUB_PR_REVIEW_LIMITS.maxLoginChars,
    ),
    isDraft: item.isDraft === true,
    createdAt: identifier(
      item.createdAt,
      GITHUB_PR_REVIEW_LIMITS.maxTimestampChars,
    ),
    updatedAt: identifier(
      item.updatedAt,
      GITHUB_PR_REVIEW_LIMITS.maxTimestampChars,
    ),
    commentsCount: integer(item.commentsCount),
  };
}

function mapTimelineItem(
  raw: unknown,
  kind: "review" | "comment",
  index: number,
): GitHubPrReviewTimelineItem | null {
  const item = objectValue(raw);
  if (!item) {
    return null;
  }
  const author = objectValue(item.author);
  const createdAt = identifier(
    kind === "review" ? item.submittedAt : item.createdAt,
    GITHUB_PR_REVIEW_LIMITS.maxTimestampChars,
  );
  return {
    id:
      identifier(item.id, 256) ||
      `${kind}:${identifier(author?.login, 128)}:${createdAt}:${index}`,
    kind,
    authorLogin: identifier(
      author?.login,
      GITHUB_PR_REVIEW_LIMITS.maxLoginChars,
    ),
    body: text(item.body, GITHUB_PR_REVIEW_LIMITS.maxReviewBodyChars),
    state: identifier(kind === "review" ? item.state : "COMMENTED", 64),
    createdAt,
    url: identifier(item.url, GITHUB_PR_REVIEW_LIMITS.maxUrlChars),
  };
}

function mapCheck(raw: unknown): GitHubPrCheck | null {
  const item = objectValue(raw);
  if (!item) {
    return null;
  }
  const typeName = identifier(item.__typename, 64);
  const name = identifier(
    typeName === "StatusContext" ? item.context : item.name,
    256,
  );
  if (!name) {
    return null;
  }
  return {
    name,
    status: identifier(
      typeName === "StatusContext" ? item.state : item.status,
      64,
    ),
    conclusion: identifier(item.conclusion, 64),
    detailsUrl: identifier(
      typeName === "StatusContext" ? item.targetUrl : item.detailsUrl,
      GITHUB_PR_REVIEW_LIMITS.maxUrlChars,
    ),
  };
}

function mapFile(raw: unknown): GitHubPrFile | null {
  const item = objectValue(raw);
  if (!item) {
    return null;
  }
  const path = identifier(item.filename, GITHUB_PR_REVIEW_LIMITS.maxPathChars);
  if (!path) {
    return null;
  }
  const rawPatch = typeof item.patch === "string" ? item.patch : "";
  const cleanPatch = stripControlSequences(rawPatch);
  return {
    path,
    previousPath: identifier(
      item.previous_filename,
      GITHUB_PR_REVIEW_LIMITS.maxPathChars,
    ),
    status: identifier(item.status, 64),
    additions: integer(item.additions),
    deletions: integer(item.deletions),
    patch: cleanPatch.slice(0, GITHUB_PR_REVIEW_LIMITS.maxPatchChars),
    patchTruncated: cleanPatch.length > GITHUB_PR_REVIEW_LIMITS.maxPatchChars,
  };
}

async function readViewerLogin(args: {
  cwd?: string;
  run: RunCommand;
}): Promise<{ ok: boolean; login: string; stderr: string }> {
  const result = await args.run({
    command: "gh",
    commandArgs: ["api", "user", "--jq", ".login"],
    cwd: args.cwd,
    maxOutputChars: 10_000,
    timeoutMs: GH_TIMEOUT_MS,
  });
  invalidateAuthOnFailure(result, args.cwd);
  return {
    ok: result.ok,
    login: result.ok
      ? identifier(result.stdout, GITHUB_PR_REVIEW_LIMITS.maxLoginChars)
      : "",
    stderr: result.ok ? "" : describeGhFailure(result),
  };
}

export async function listGitHubPullRequests(args: {
  cwd?: string;
  kind: GitHubPrInboxKind;
  limit?: number;
  runCommand?: RunCommand;
}): Promise<GitHubPrInboxResult> {
  const run = args.runCommand ?? runCommandArgs;
  const auth = await ensureGhAuth({ cwd: args.cwd, runCommand: run });
  if (!auth.ok) {
    return {
      ok: false,
      items: [],
      viewerLogin: "",
      stderr: describeGhFailure(auth),
    };
  }

  const limit = Math.max(
    1,
    Math.min(args.limit ?? 30, GITHUB_PR_REVIEW_LIMITS.maxInboxItems),
  );
  const filter =
    args.kind === "review-requested"
      ? ["--review-requested=@me"]
      : ["--author=@me"];
  const [searchResult, viewerResult] = await Promise.all([
    run({
      command: "gh",
      commandArgs: [
        "search",
        "prs",
        ...filter,
        "--state=open",
        "--sort=updated",
        "--order=desc",
        `--limit=${limit}`,
        "--json",
        "number,title,url,repository,author,isDraft,createdAt,updatedAt,commentsCount",
      ],
      cwd: args.cwd,
      maxOutputChars: GH_MAX_OUTPUT_CHARS,
      timeoutMs: GH_TIMEOUT_MS,
    }),
    readViewerLogin({ cwd: args.cwd, run }),
  ]);
  invalidateAuthOnFailure(searchResult, args.cwd);
  if (!searchResult.ok) {
    return {
      ok: false,
      items: [],
      viewerLogin: viewerResult.login,
      stderr: describeGhFailure(searchResult),
    };
  }

  const parsed = parseJsonArray(searchResult.stdout);
  if (!parsed) {
    return {
      ok: false,
      items: [],
      viewerLogin: viewerResult.login,
      stderr: "Could not read the GitHub pull request list.",
    };
  }
  return {
    ok: true,
    items: parsed
      .map(mapInboxItem)
      .filter((item): item is GitHubPrInboxItem => item !== null)
      .slice(0, limit),
    viewerLogin: viewerResult.login,
    stderr: viewerResult.ok ? "" : viewerResult.stderr,
  };
}

export async function fetchGitHubPullRequestReviewDetail(args: {
  cwd?: string;
  prUrl: string;
  runCommand?: RunCommand;
}): Promise<GitHubPrReviewDetailResult> {
  const run = args.runCommand ?? runCommandArgs;
  const ref = parsePrContextUrl(args.prUrl);
  if (!ref) {
    return {
      ok: false,
      detail: null,
      stderr: "Not a GitHub pull request URL.",
    };
  }
  const auth = await ensureGhAuth({ cwd: args.cwd, runCommand: run });
  if (!auth.ok) {
    return { ok: false, detail: null, stderr: describeGhFailure(auth) };
  }

  const [detailResult, filesResult, viewerResult] = await Promise.all([
    run({
      command: "gh",
      commandArgs: ["pr", "view", args.prUrl, "--json", DETAIL_FIELDS],
      cwd: args.cwd,
      maxOutputChars: GH_MAX_OUTPUT_CHARS,
      timeoutMs: GH_TIMEOUT_MS,
    }),
    run({
      command: "gh",
      commandArgs: [
        "api",
        "-H",
        "Accept: application/vnd.github+json",
        `repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=${GITHUB_PR_REVIEW_LIMITS.maxFiles}&page=1`,
      ],
      cwd: args.cwd,
      maxOutputChars: GH_MAX_OUTPUT_CHARS,
      timeoutMs: GH_TIMEOUT_MS,
    }),
    readViewerLogin({ cwd: args.cwd, run }),
  ]);
  invalidateAuthOnFailure(detailResult, args.cwd);
  invalidateAuthOnFailure(filesResult, args.cwd);
  if (!detailResult.ok) {
    return { ok: false, detail: null, stderr: describeGhFailure(detailResult) };
  }
  const rawDetail = parseJsonObject(detailResult.stdout);
  if (!rawDetail) {
    return {
      ok: false,
      detail: null,
      stderr: "Could not read the GitHub pull request.",
    };
  }

  const rawReviews = Array.isArray(rawDetail.latestReviews)
    ? rawDetail.latestReviews
    : [];
  const rawComments = Array.isArray(rawDetail.comments)
    ? rawDetail.comments
    : [];
  const timeline = [
    ...rawReviews.map((item, index) => mapTimelineItem(item, "review", index)),
    ...rawComments.map((item, index) =>
      mapTimelineItem(item, "comment", index),
    ),
  ]
    .filter((item): item is GitHubPrReviewTimelineItem => item !== null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-GITHUB_PR_REVIEW_LIMITS.maxTimelineItems);
  const rawChecks = Array.isArray(rawDetail.statusCheckRollup)
    ? rawDetail.statusCheckRollup
    : [];
  const rawFiles = filesResult.ok ? parseJsonArray(filesResult.stdout) : null;
  const files = (rawFiles ?? [])
    .map(mapFile)
    .filter((file): file is GitHubPrFile => file !== null)
    .slice(0, GITHUB_PR_REVIEW_LIMITS.maxFiles);
  const changedFiles = integer(rawDetail.changedFiles);
  const detail: GitHubPrReviewDetail = {
    number: integer(rawDetail.number),
    title: text(rawDetail.title, GITHUB_PR_REVIEW_LIMITS.maxTitleChars),
    body: text(rawDetail.body, GITHUB_PR_REVIEW_LIMITS.maxBodyChars),
    url: identifier(rawDetail.url, GITHUB_PR_REVIEW_LIMITS.maxUrlChars),
    repositoryWithOwner: `${ref.owner}/${ref.repo}`,
    authorLogin: identifier(
      objectValue(rawDetail.author)?.login,
      GITHUB_PR_REVIEW_LIMITS.maxLoginChars,
    ),
    viewerLogin: viewerResult.login,
    isDraft: rawDetail.isDraft === true,
    createdAt: identifier(
      rawDetail.createdAt,
      GITHUB_PR_REVIEW_LIMITS.maxTimestampChars,
    ),
    updatedAt: identifier(
      rawDetail.updatedAt,
      GITHUB_PR_REVIEW_LIMITS.maxTimestampChars,
    ),
    baseRefName: identifier(rawDetail.baseRefName, 256),
    baseRefOid: identifier(rawDetail.baseRefOid, 64),
    headRefName: identifier(rawDetail.headRefName, 256),
    headRefOid: identifier(rawDetail.headRefOid, 64),
    reviewDecision: identifier(rawDetail.reviewDecision, 64),
    mergeable: identifier(rawDetail.mergeable, 64),
    mergeStateStatus: identifier(rawDetail.mergeStateStatus, 64),
    additions: integer(rawDetail.additions),
    deletions: integer(rawDetail.deletions),
    changedFiles,
    files,
    filesTruncated: changedFiles > files.length,
    filesError:
      filesResult.ok && rawFiles
        ? ""
        : filesResult.ok
          ? "Could not read changed files."
          : describeGhFailure(filesResult),
    timeline,
    checks: rawChecks
      .map(mapCheck)
      .filter((check): check is GitHubPrCheck => check !== null),
  };
  return { ok: true, detail, stderr: viewerResult.stderr };
}

export async function submitGitHubPullRequestReview(args: {
  cwd?: string;
  prUrl: string;
  expectedHeadOid: string;
  event: GitHubPrReviewEvent;
  body?: string;
  runCommand?: RunCommand;
}): Promise<GitHubPrReviewSubmitResult> {
  const emptyResult = (stderr: string): GitHubPrReviewSubmitResult => ({
    ok: false,
    stale: false,
    currentHeadOid: "",
    reviewId: null,
    reviewUrl: "",
    stderr,
  });
  const run = args.runCommand ?? runCommandArgs;
  const ref = parsePrContextUrl(args.prUrl);
  if (!ref) {
    return emptyResult("Not a GitHub pull request URL.");
  }
  if (args.event === "REQUEST_CHANGES" && !args.body?.trim()) {
    return emptyResult("A change request needs a review summary.");
  }
  const auth = await ensureGhAuth({ cwd: args.cwd, runCommand: run });
  if (!auth.ok) {
    return emptyResult(describeGhFailure(auth));
  }

  const [headResult, viewerResult] = await Promise.all([
    run({
      command: "gh",
      commandArgs: ["pr", "view", args.prUrl, "--json", "headRefOid,author"],
      cwd: args.cwd,
      maxOutputChars: 100_000,
      timeoutMs: GH_TIMEOUT_MS,
    }),
    readViewerLogin({ cwd: args.cwd, run }),
  ]);
  invalidateAuthOnFailure(headResult, args.cwd);
  if (!headResult.ok) {
    return emptyResult(describeGhFailure(headResult));
  }
  const rawHead = parseJsonObject(headResult.stdout);
  if (!rawHead) {
    return emptyResult("Could not verify the pull request head.");
  }
  const currentHeadOid = identifier(rawHead.headRefOid, 64);
  if (!currentHeadOid || currentHeadOid !== args.expectedHeadOid) {
    return {
      ...emptyResult(
        "The pull request changed after it was loaded. Review the latest diff before submitting.",
      ),
      stale: true,
      currentHeadOid,
    };
  }
  const authorLogin = identifier(
    objectValue(rawHead.author)?.login,
    GITHUB_PR_REVIEW_LIMITS.maxLoginChars,
  );
  if (
    args.event === "APPROVE" &&
    viewerResult.login &&
    viewerResult.login.toLowerCase() === authorLogin.toLowerCase()
  ) {
    return emptyResult("You cannot approve your own pull request.");
  }

  const submitResult = await run({
    command: "gh",
    commandArgs: [
      "api",
      "--method",
      "POST",
      "-H",
      "Accept: application/vnd.github+json",
      `repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`,
      "-f",
      `commit_id=${currentHeadOid}`,
      "-f",
      `event=${args.event}`,
      "-f",
      `body=${args.body ?? ""}`,
    ],
    cwd: args.cwd,
    maxOutputChars: 500_000,
    timeoutMs: GH_TIMEOUT_MS,
  });
  invalidateAuthOnFailure(submitResult, args.cwd);
  if (!submitResult.ok) {
    return {
      ...emptyResult(describeGhFailure(submitResult)),
      currentHeadOid,
    };
  }
  const rawReview = parseJsonObject(submitResult.stdout);
  return {
    ok: true,
    stale: false,
    currentHeadOid,
    reviewId: rawReview ? integer(rawReview.id) || null : null,
    reviewUrl: rawReview
      ? identifier(rawReview.html_url, GITHUB_PR_REVIEW_LIMITS.maxUrlChars)
      : "",
    stderr: "",
  };
}
